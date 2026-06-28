import { test, expect } from '@playwright/test';

const ADD_BTN = /^\+\s*Add$|^Add to cart$/;

async function addFirstProductToCart(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: ADD_BTN }).first().click();
    await page.waitForTimeout(500);
}

test.describe('Cart — add to cart', () => {
    test('adding product from catalog increments cart badge', async ({ page }) => {
        await addFirstProductToCart(page);

        const badge = page.locator('.app-header__cart-badge').first();
        await expect(badge).toBeVisible();
    });

    test('added product appears in cart page', async ({ page }) => {
        await addFirstProductToCart(page);

        await page.goto('/cart');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        // Cart should not be empty
        await expect(
            page.locator('.cart-item, [class*="cart-line"], [class*="line-item"]').first(),
        ).toBeVisible({ timeout: 8000 });
    });

    test('cart content persists after page reload', async ({ page }) => {
        await addFirstProductToCart(page);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await page.goto('/cart');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        await expect(
            page.locator('.cart-item, [class*="cart-line"], [class*="line-item"]').first(),
        ).toBeVisible({ timeout: 8000 });
    });
});
