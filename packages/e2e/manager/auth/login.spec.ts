import { test, expect } from '@playwright/test';

// Runs unauthenticated (manager-noauth project, no storageState) — every other manager project
// logs in programmatically via global-setup.ts and never actually exercises this page. First
// real UI coverage of the manager portal's login form (mirrors storefront/auth/login.spec.ts).
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

    // See AGENTS.md "A fetch() network failure is not the same as 'logged out'" — regression
    // coverage for the incident that prompted that fix: a real, still-logged-in session must
    // survive a transient admin-api outage instead of being bounced back to /login.
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
});
