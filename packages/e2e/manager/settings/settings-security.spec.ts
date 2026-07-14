import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const OPERATOR = { username: 'ivan.operator@mivend.dev', password: 'Password123!' };
const OPERATOR_AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'manager-operator.json');

// Same rationale as storefront/account/settings-sessions.spec.ts: talk to /admin-api directly
// with hand-managed session cookies for the multi-session assertions, so the shared per-role
// storageState files (.auth/manager-*.json) used by every other manager spec are never touched
// (docs/e2e-testing.md gotcha #6/#7 — this repo's manager equivalent).
async function adminApiRequest<T>(
    cookie: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await fetch(`${SERVER_URL}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

async function loginViaApi(): Promise<string> {
    const res = await fetch(`${SERVER_URL}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) {
                login(username: $u, password: $p) { __typename ... on CurrentUser { id } }
            }`,
            variables: { u: OPERATOR.username, p: OPERATOR.password },
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
    const data = await adminApiRequest<{ activeAdministrator: { id: string } | null }>(
        cookie,
        `{ activeAdministrator { id } }`,
    );
    return data.activeAdministrator !== null;
}

// Any test that calls endAllSessions for the operator account also kills the session baked
// into the shared `.auth/manager-operator.json` storageState that every other manager-operator
// spec relies on. Re-login and overwrite that file's cookies so later specs in the same run
// (not just this segmented one) aren't left with a dead session.
async function restoreOperatorAuthFile(): Promise<void> {
    const cookies = await loginViaApi();
    const [sessionValue, sigValue] = cookies.split('; ').map(c => c.split('=').slice(1).join('='));
    const authFile = JSON.parse(fs.readFileSync(OPERATOR_AUTH_FILE, 'utf-8')) as {
        cookies: { name: string; value: string }[];
    };
    for (const c of authFile.cookies) {
        if (c.name === 'session') c.value = sessionValue;
        if (c.name === 'session.sig') c.value = sigValue;
    }
    fs.writeFileSync(OPERATOR_AUTH_FILE, JSON.stringify(authFile, null, 2));
}

test.describe('Session management API (admin-api)', () => {
    test('a second concurrent login shows up in mySessions and can be ended from the first (positive)', async (_fixtures, testInfo) => {
        // Runs once is enough — this hits the admin-api directly, independent of which
        // seeded role project executes it. Skip in every project but one to avoid 5x
        // redundant runs against the same operator account.
        test.skip(testInfo.project.name !== 'manager-operator', 'API-level test, runs once');

        const cookieA = await loginViaApi();
        const cookieB = await loginViaApi();

        const { mySessions } = await adminApiRequest<{
            mySessions: { id: string; current: boolean }[];
        }>(cookieA, `{ mySessions { id current } }`);
        expect(mySessions.length).toBeGreaterThanOrEqual(2);
        const other = mySessions.find(s => !s.current);
        expect(other).toBeTruthy();

        const { endSession } = await adminApiRequest<{ endSession: boolean }>(
            cookieA,
            `mutation($id: ID!) { endSession(id: $id) }`,
            { id: other!.id },
        );
        expect(endSession).toBe(true);

        expect(await isSessionAlive(cookieB)).toBe(false);
        expect(await isSessionAlive(cookieA)).toBe(true);
    });

    test("endAllSessions ends every session for the admin, including the caller's own (positive)", async (_fixtures, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-operator', 'API-level test, runs once');

        const cookieA = await loginViaApi();
        const cookieB = await loginViaApi();

        const { endAllSessions } = await adminApiRequest<{ endAllSessions: boolean }>(
            cookieA,
            `mutation { endAllSessions }`,
        );
        expect(endAllSessions).toBe(true);

        expect(await isSessionAlive(cookieA)).toBe(false);
        expect(await isSessionAlive(cookieB)).toBe(false);

        await restoreOperatorAuthFile();
    });

    test('endSession with a session id that does not belong to the caller is a no-op (negative)', async (_fixtures, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-operator', 'API-level test, runs once');

        const cookieA = await loginViaApi();
        const { endSession } = await adminApiRequest<{ endSession: boolean }>(
            cookieA,
            `mutation($id: ID!) { endSession(id: $id) }`,
            { id: '999999999' },
        );
        expect(endSession).toBe(false);
        expect(await isSessionAlive(cookieA)).toBe(true);
    });
});

test.describe('Settings > Security page — UI', () => {
    // Fresh, isolated context (not the shared .auth/manager-operator.json storageState) so
    // ending this session can't invalidate the auth file every other manager spec relies on.
    test('lists a second session and "End session" removes it from the list (positive)', async ({
        browser,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-operator', 'UI test, runs once');

        // Clear any sessions left over from a prior (possibly interrupted) run of this same
        // operator account — including the shared storageState session, which is always live
        // going into this test — to establish a known-clean baseline of zero sessions before
        // creating exactly the two this test needs. The file is only restored at the very end
        // (not right after cleanup) — restoring earlier would itself create a third live
        // session and break the "exactly 2 rows" assertion below.
        const cleanupCookie = await loginViaApi();
        await adminApiRequest<{ endAllSessions: boolean }>(
            cleanupCookie,
            `mutation { endAllSessions }`,
        );

        const cookieB = await loginViaApi();
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input').first().fill(OPERATOR.username);
            await page.locator('input[type="password"]').fill(OPERATOR.password);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));

            await page.goto('/settings/security');
            await expect(page.locator('.security-page__row')).toHaveCount(2, { timeout: 15000 });

            const otherRow = page
                .locator('.security-page__row')
                .filter({ hasNot: page.locator('.security-page__current') });
            await otherRow.getByRole('button', { name: 'End session' }).click();
            await expect(page.locator('.security-page__row')).toHaveCount(1, { timeout: 15000 });

            expect(await isSessionAlive(cookieB)).toBe(false);
        } finally {
            await context.close();
        }

        await restoreOperatorAuthFile();
    });

    // Runs before "Sign out everywhere" below: that test's endAllSessions-based mutation ends
    // every session for the operator account, including the one baked into the shared
    // `.auth/manager-operator.json` storageState this test (and every other manager-operator
    // spec) relies on. Ordering this one first keeps the shared auth file valid for the rest
    // of the suite.
    test('/settings/security is reachable directly and shows the Security sub-nav tab as active (positive)', async ({
        page,
    }) => {
        await page.goto('/settings/security');
        await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible({
            timeout: 15000,
        });
        await expect(page.locator('.settings-sub-nav a.active')).toHaveText('Security');
    });

    test('"Sign out everywhere" logs the current session out too (positive)', async ({
        browser,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-operator', 'UI test, runs once');

        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.locator('input').first().fill(OPERATOR.username);
            await page.locator('input[type="password"]').fill(OPERATOR.password);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));

            await page.goto('/settings/security');
            await page.getByRole('button', { name: 'Sign out everywhere' }).click();
            await page.waitForURL(url => url.pathname.includes('/login'));
            expect(page.url()).toContain('/login');
        } finally {
            await context.close();
        }

        // endAllSessions terminates every session for the operator account, including the one
        // baked into the shared `.auth/manager-operator.json` storageState that every other
        // manager-operator spec depends on. Re-login and overwrite that file so a full-suite
        // run (not just this segmented spec) doesn't leave later specs with a dead session.
        const cookies = await loginViaApi();
        const [sessionValue, sigValue] = cookies
            .split('; ')
            .map(c => c.split('=').slice(1).join('='));
        const authFile = JSON.parse(fs.readFileSync(OPERATOR_AUTH_FILE, 'utf-8')) as {
            cookies: { name: string; value: string }[];
        };
        for (const c of authFile.cookies) {
            if (c.name === 'session') c.value = sessionValue;
            if (c.name === 'session.sig') c.value = sigValue;
        }
        fs.writeFileSync(OPERATOR_AUTH_FILE, JSON.stringify(authFile, null, 2));
    });
});
