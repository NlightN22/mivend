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
});
