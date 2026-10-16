import { E2E_API_USER_AGENT, E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const OPERATOR = { username: 'ivan.operator@mivend.dev', password: 'Password123!' };
const OPERATOR_AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'manager-operator.json');

// Hits /admin-api directly with hand-managed session cookies so the shared per-role
// storageState files (.auth/manager-*.json) used by other manager specs are not touched.
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
        headers: { 'Content-Type': 'application/json', 'User-Agent': E2E_API_USER_AGENT },
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) {
                login(username: $u, password: $p) { __typename ... on CurrentUser { id } }
            }`,
            variables: { u: OPERATOR.username, p: OPERATOR.password },
        }),
    });
    // Vendure's session is signed with two Set-Cookie headers (session + session.sig);
    // headers.get('set-cookie') returns only the first, so use getSetCookie() to get both.
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

// endAllSessions also kills the session in shared .auth/manager-operator.json;
// re-login and overwrite that file so later specs in the run keep a live session.
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
    test('a second concurrent login shows up in mySessions and can be ended from the first (positive)', async ({
        browserName: _browserName,
    }, testInfo) => {
        // Hits admin-api directly, independent of the role project, so run it in only one project
        // to avoid redundant runs against the same operator account.
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

    test("endAllSessions ends every session for the admin, including the caller's own (positive)", async ({
        browserName: _browserName,
    }, testInfo) => {
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

    test('endSession with a session id that does not belong to the caller is a no-op (negative)', async ({
        browserName: _browserName,
    }, testInfo) => {
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

        // Ends the shared storageState session too, so the baseline is zero. Restore that file only at the end:
        // restoring earlier would add a third live session and break the exactly-2-rows assertion.
        const cleanupCookie = await loginViaApi();
        await adminApiRequest<{ endAllSessions: boolean }>(
            cleanupCookie,
            `mutation { endAllSessions }`,
        );

        const cookieB = await loginViaApi();
        const context = await browser.newContext({ userAgent: E2E_BROWSER_USER_AGENT });
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

    // Must run before 'Sign out everywhere': that test ends every operator session, including
    // the one in shared .auth/manager-operator.json that other manager specs depend on.
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

        const context = await browser.newContext({ userAgent: E2E_BROWSER_USER_AGENT });
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

        // endAllSessions ends the session in shared .auth/manager-operator.json too;
        // re-login and overwrite that file so later specs in a full-suite run aren't left dead.
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
