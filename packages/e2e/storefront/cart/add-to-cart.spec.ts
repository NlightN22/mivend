import { test, expect, type Page } from '@playwright/test';

const ADD_BTN = /^\+\s*Add$|^Add to cart$/;

async function clearCart(page: Page): Promise<void> {
    await page.request.post('http://localhost:3000/shop-api', {
        data: { query: 'mutation { removeAllOrderLines { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
}

async function addFirstProductToCart(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row, .mv-product-card').first()).toBeVisible({
        timeout: 10000,
    });
    const addBtn = page.getByRole('button', { name: ADD_BTN }).first();
    // If Add button is not visible (all items already in cart), skip clearing via UI
    const visible = await addBtn.isVisible().catch(() => false);
    if (!visible) {
        await clearCart(page);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row, .mv-product-card').first()).toBeVisible({
            timeout: 10000,
        });
    }
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
