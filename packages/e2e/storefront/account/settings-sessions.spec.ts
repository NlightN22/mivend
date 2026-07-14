import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { E2E_CUSTOMER } from '../../fixtures/seed';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const CUSTOMER_AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'storefront-user.json');

// Session-management coverage (issue #40) talks to /shop-api directly with hand-managed
// session cookies — this sidesteps App.vue's DEV-only auto-relogin (see App.vue's
// `authStore.login('ivan@autoservice-nord.example', ...)` fallback), which would otherwise
// mask a genuinely-invalidated session behind a fresh demo login on the next page navigation.
async function shopApiRequest<T>(
    cookie: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await fetch(`${SERVER_URL}/shop-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

async function loginViaApi(): Promise<string> {
    const res = await fetch(`${SERVER_URL}/shop-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) {
                login(username: $u, password: $p) { __typename ... on CurrentUser { id } }
            }`,
            variables: { u: E2E_CUSTOMER.email, p: E2E_CUSTOMER.password },
        }),
    });
    // Vendure's cookie session is signed — it sets two cookies (`session` + `session.sig`).
    // `res.headers.get('set-cookie')` only returns the first one (undici/WHATWG fetch
    // combines multiple Set-Cookie headers under `get`), so the signature cookie is silently
    // dropped and the server treats the session as invalid. `getSetCookie()` returns all of them.
    const cookies = res.headers
        .getSetCookie()
        .map(c => c.split(';')[0])
        .join('; ');
    if (!cookies.includes('session=')) throw new Error('login did not return a session cookie');
    return cookies;
}

async function isSessionAlive(cookie: string): Promise<boolean> {
    const data = await shopApiRequest<{ activeCustomer: { id: string } | null }>(
        cookie,
        `{ activeCustomer { id } }`,
    );
    return data.activeCustomer !== null;
}

// Any test that calls endAllSessions for E2E_CUSTOMER also kills the session baked into the
// shared `.auth/storefront-user.json` storageState that every other storefront spec relies on
// (docs/e2e-testing.md gotcha #6/#7). Re-login and overwrite that file's cookies afterward so
// later specs in the same run (not just this segmented one) aren't left with a dead session.
async function restoreCustomerAuthFile(): Promise<void> {
    const cookies = await loginViaApi();
    const [sessionValue, sigValue] = cookies.split('; ').map(c => c.split('=').slice(1).join('='));
    const authFile = JSON.parse(fs.readFileSync(CUSTOMER_AUTH_FILE, 'utf-8')) as {
        cookies: { name: string; value: string }[];
    };
    for (const c of authFile.cookies) {
        if (c.name === 'session') c.value = sessionValue;
        if (c.name === 'session.sig') c.value = sigValue;
    }
    fs.writeFileSync(CUSTOMER_AUTH_FILE, JSON.stringify(authFile, null, 2));
}

test.describe('Session management API (shop-api)', () => {
    test('a second concurrent login shows up in mySessions and can be ended from the first (positive)', async () => {
        const cookieA = await loginViaApi();
        const cookieB = await loginViaApi();

        const { mySessions } = await shopApiRequest<{
            mySessions: { id: string; current: boolean }[];
        }>(cookieA, `{ mySessions { id current } }`);
        expect(mySessions.length).toBeGreaterThanOrEqual(2);
        const other = mySessions.find(s => !s.current);
        expect(other).toBeTruthy();

        const { endSession } = await shopApiRequest<{ endSession: boolean }>(
            cookieA,
            `mutation($id: ID!) { endSession(id: $id) }`,
            { id: other!.id },
        );
        expect(endSession).toBe(true);

        expect(await isSessionAlive(cookieB)).toBe(false);
        expect(await isSessionAlive(cookieA)).toBe(true);
    });

    test('endSession with a session id that does not belong to the caller is a no-op (negative)', async () => {
        const cookieA = await loginViaApi();
        const { endSession } = await shopApiRequest<{ endSession: boolean }>(
            cookieA,
            `mutation($id: ID!) { endSession(id: $id) }`,
            { id: '999999999' },
        );
        expect(endSession).toBe(false);
        expect(await isSessionAlive(cookieA)).toBe(true);
    });

    test("endAllSessions ends every session for the user, including the caller's own (positive)", async () => {
        const cookieA = await loginViaApi();
        const cookieB = await loginViaApi();

        const { endAllSessions } = await shopApiRequest<{ endAllSessions: boolean }>(
            cookieA,
            `mutation { endAllSessions }`,
        );
        expect(endAllSessions).toBe(true);

        expect(await isSessionAlive(cookieA)).toBe(false);
        expect(await isSessionAlive(cookieB)).toBe(false);

        await restoreCustomerAuthFile();
    });
});

test.describe('Settings page — Security UI', () => {
    // Fresh, isolated context (not the shared storefront-user.json storageState) so ending
    // this session can't invalidate the auth file every other storefront spec relies on
    // (docs/e2e-testing.md gotcha #6/#7).
    test('lists a second session and "End session" removes it from the list (positive)', async ({
        browser,
    }) => {
        // Establish a known-clean baseline of zero sessions first — the shared storageState
        // session is always live going into this test. The file is only restored at the very
        // end; restoring earlier would itself create a third live session and break the
        // "exactly 2 rows" assertion below.
        const cleanupCookie = await loginViaApi();
        await shopApiRequest<{ endAllSessions: boolean }>(
            cleanupCookie,
            `mutation { endAllSessions }`,
        );

        const cookieB = await loginViaApi();
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
            await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
            await page.getByRole('button', { name: 'Войти' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));

            await page.goto('/account/settings');
            await expect(page.locator('.set-session')).toHaveCount(2, { timeout: 15000 });

            const otherRow = page
                .locator('.set-session')
                .filter({ hasNot: page.locator('.set-pill') });
            await otherRow.getByRole('button', { name: 'End session' }).click();
            await expect(page.locator('.set-session')).toHaveCount(1, { timeout: 15000 });

            expect(await isSessionAlive(cookieB)).toBe(false);
        } finally {
            await context.close();
        }

        await restoreCustomerAuthFile();
    });

    test('"Sign out everywhere" logs the current session out too (positive)', async ({
        browser,
    }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
            await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
            await page.getByRole('button', { name: 'Войти' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));

            await page.goto('/account/settings');
            await page.getByRole('button', { name: 'Sign out everywhere' }).click();
            await page.waitForURL(url => url.pathname.includes('/login'));
            expect(page.url()).toContain('/login');
        } finally {
            await context.close();
        }

        await restoreCustomerAuthFile();
    });
});
