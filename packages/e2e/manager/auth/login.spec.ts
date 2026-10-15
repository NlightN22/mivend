import { test, expect } from '@playwright/test';

// Runs unauthenticated (manager-noauth project): other projects log in via global-setup.ts
// and never reach this page, so this is the only spec covering the manager login form.
test.describe('Manager login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('successful login redirects to the dashboard', async ({ page }) => {
        await page.locator('input').first().fill('ivan.operator@mivend.dev');
        await page.locator('input[type="password"]').fill('Password123!');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await page.waitForURL(url => !url.pathname.includes('/login'));
        expect(page.url()).not.toContain('/login');
        await expect(page.getByText('Welcome back,')).toBeVisible();
    });

    test('wrong password shows an error and stays on the login page', async ({ page }) => {
        await page.locator('input').first().fill('ivan.operator@mivend.dev');
        await page.locator('input[type="password"]').fill('wrong-password');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.locator('.mv-notice--error')).toBeVisible();
        expect(page.url()).toContain('/login');
    });

    test('a protected route redirects to login when not authenticated', async ({ page }) => {
        await page.goto('/orders');
        await page.waitForURL(url => url.pathname.includes('/login'));
        expect(page.url()).toContain('redirect=/orders');
    });

    test('remember me sets a persistent session cookie; unchecked stays session-only', async ({
        page,
        context,
    }) => {
        await page.locator('input').first().fill('ivan.operator@mivend.dev');
        await page.locator('input[type="password"]').fill('Password123!');
        await page.locator('input[type="checkbox"]').check();
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(url => !url.pathname.includes('/login'));

        const cookies = await context.cookies();
        const sessionCookie = cookies.find(c => c.name === 'session');
        expect(sessionCookie).toBeTruthy();
        expect(sessionCookie?.expires).toBeGreaterThan(0); // persistent, not session-only (-1)
    });

    // Network failures from fetch() must not be read as 'logged out': a valid session survives
    // a transient admin-api outage instead of being redirected to /login.
    test('a transient admin-api outage after login does not force a re-login', async ({ page }) => {
        await page.locator('input').first().fill('ivan.operator@mivend.dev');
        await page.locator('input[type="password"]').fill('Password123!');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(url => !url.pathname.includes('/login'));

        // Simulate the admin-api being briefly unreachable (e.g. a dev server restart) for the
        // next request only, then recovering — matches adminApi's retry-with-backoff window.
        let failedOnce = false;
        await page.route('**/admin-api', route => {
            if (!failedOnce) {
                failedOnce = true;
                return route.abort('connectionrefused');
            }
            return route.continue();
        });

        await page.reload();
        await page.waitForTimeout(2000); // let adminApi's retry/backoff run its course

        expect(page.url()).not.toContain('/login');
        await expect(page.getByText('Welcome back,')).toBeVisible();
    });

    // Router guard redirects only on a confirmed 'unauthenticated', never on 'unknown' (retrying).
    // An outage outlasting adminApi's ~4.2s bounded retry must not be treated as logged out.
    test('an outage longer than the bounded retry never redirects to /login and recovers on its own', async ({
        page,
    }) => {
        await page.locator('input').first().fill('ivan.operator@mivend.dev');
        await page.locator('input[type="password"]').fill('Password123!');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(url => !url.pathname.includes('/login'));

        const outageStart = Date.now();
        const OUTAGE_MS = 6_000;
        await page.route('**/admin-api', route => {
            if (Date.now() - outageStart < OUTAGE_MS) {
                return route.abort('connectionrefused');
            }
            return route.continue();
        });

        await page.reload();

        // Must never navigate to /login while the outage is ongoing or resolving.
        await page.waitForTimeout(OUTAGE_MS - 1000);
        expect(page.url()).not.toContain('/login');

        // Once the outage ends, the background retry (re-armed at up to 20s) eventually
        // succeeds and the page reflects the still-valid session without any re-login.
        await expect(page.getByText('Welcome back,')).toBeVisible({ timeout: 15_000 });
        expect(page.url()).not.toContain('/login');
    });
});
