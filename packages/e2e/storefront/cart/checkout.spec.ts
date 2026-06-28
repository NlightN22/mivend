import { test, expect } from '@playwright/test';

test.describe('Checkout', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'В корзину' }).first().click();
        await page.waitForTimeout(500);
    });

    test('checkout page loads and shows cart items', async ({ page }) => {
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        await expect(page).not.toHaveURL('/cart');
        await expect(page.locator('text=/\\d+/')).toBeVisible();
    });

    test('checkout page has order submit button', async ({ page }) => {
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('button', { name: 'Оформить заказ' })).toBeVisible();
    });
});
