import { E2E_API_USER_AGENT, E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { E2E_CUSTOMER } from '../../fixtures/seed';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const CUSTOMER_AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'storefront-user.json');

// Bypasses App.vue's DEV-only auto-relogin, which would mask an invalidated session
// by silently logging in again on the next navigation, so cookies are managed by hand.
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
        headers: { 'Content-Type': 'application/json', 'User-Agent': E2E_API_USER_AGENT },
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) {
                login(username: $u, password: $p) { __typename ... on CurrentUser { id } }
            }`,
            variables: { u: E2E_CUSTOMER.email, p: E2E_CUSTOMER.password },
        }),
    });
    // Vendure's session is signed: two Set-Cookie headers (`session` + `session.sig`).
    // headers.get('set-cookie') returns only the first; use getSetCookie() to keep both.
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

// endAllSessions for E2E_CUSTOMER also kills the session in the shared storageState file
// that other storefront specs use; re-login and rewrite its cookies afterward.
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
    // Isolated context so ending this session can't invalidate the shared storefront-user.json
    test('lists a second session and "End session" removes it from the list (positive)', async ({
        browser,
    }) => {
        // Shared storageState session is always live, so start from zero sessions.
        // Restoring the file earlier adds a third live session and breaks the 'exactly 2 rows' check.
        const cleanupCookie = await loginViaApi();
        await shopApiRequest<{ endAllSessions: boolean }>(
            cleanupCookie,
            `mutation { endAllSessions }`,
        );

        const cookieB = await loginViaApi();
        const context = await browser.newContext({ userAgent: E2E_BROWSER_USER_AGENT });
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
            await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
            await page.getByRole('button', { name: 'Sign in' }).click();
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
        const context = await browser.newContext({ userAgent: E2E_BROWSER_USER_AGENT });
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
            await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
            await page.getByRole('button', { name: 'Sign in' }).click();
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
