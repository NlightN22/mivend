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
});
