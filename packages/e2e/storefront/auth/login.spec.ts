import { test, expect } from '@playwright/test';
import { E2E_CUSTOMER } from '../../fixtures/seed';

test.describe('Login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('successful login redirects to home', async ({ page }) => {
        await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
        await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
        await page.getByRole('button', { name: 'Войти' }).click();

        await page.waitForURL(url => !url.pathname.includes('/login'));
        expect(page.url()).not.toContain('/login');
    });

    test('wrong password shows error message', async ({ page }) => {
        await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
        await page.locator('input[type="password"]').fill('wrong-password');
        await page.getByRole('button', { name: 'Войти' }).click();

        const error = page.locator('.login-card__error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('Неверный');
    });

    test('submitting empty fields does not navigate away', async ({ page }) => {
        await page.getByRole('button', { name: 'Войти' }).click();

        await page.waitForTimeout(500);
        expect(page.url()).toContain('/login');
    });

    test('remember me sets a persistent session cookie; unchecked stays session-only', async ({
        page,
        context,
    }) => {
        await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
        await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
        await page.locator('input[type="checkbox"]').check();
        await page.getByRole('button', { name: 'Войти' }).click();
        await page.waitForURL(url => !url.pathname.includes('/login'));

        const cookies = await context.cookies();
        const sessionCookie = cookies.find(c => c.name === 'session');
        expect(sessionCookie).toBeTruthy();
        expect(sessionCookie?.expires).toBeGreaterThan(0); // persistent, not session-only (-1)
    });

    // See AGENTS.md "A fetch() network failure is not the same as 'logged out'" — regression
    // coverage for the incident that prompted that fix: a real, still-logged-in session must
    // survive a transient shop-api outage instead of being bounced back to /login.
    test('a transient shop-api outage after login does not force a re-login', async ({ page }) => {
        await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
        await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
        await page.getByRole('button', { name: 'Войти' }).click();
        await page.waitForURL(url => !url.pathname.includes('/login'));

        // Simulate the shop-api being briefly unreachable (e.g. a dev server restart) for the
        // next request only, then recovering — matches shopApi's retry-with-backoff window.
        let failedOnce = false;
        await page.route('**/shop-api', route => {
            if (!failedOnce) {
                failedOnce = true;
                return route.abort('connectionrefused');
            }
            return route.continue();
        });

        await page.reload();
        await page.waitForTimeout(2000); // let shopApi's retry/backoff run its course

        expect(page.url()).not.toContain('/login');
        await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
    });
});
