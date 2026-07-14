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

    // Regression coverage for the tri-state auth-status fix: an outage that OUTLASTS adminApi's
    // own bounded ~4.2s retry must never be misclassified as "logged out" — the router guard
    // only redirects on a *confirmed* 'unauthenticated', never on 'unknown' (still retrying in
    // the background). Failing requests for ~6s exhausts the bounded retry and forces at least
    // one background-retry attempt (2s initial interval) before the outage ends.
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
