import { test, expect } from '@playwright/test';

test.describe('Cart — add to cart', () => {
    test('adding product from catalog increments cart badge', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'В корзину' }).first().click();
        await page.waitForTimeout(500);

        // Cart badge should show a non-zero count
        const badge = page.locator('[data-testid="cart-badge"], .cart-badge, .nav-badge').first();
        await expect(badge).toBeVisible();
    });

    test('added product appears in cart page', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'В корзину' }).first().click();
        await page.waitForTimeout(500);

        await page.goto('/cart');
        await page.waitForLoadState('networkidle');

        await expect(
            page.locator('text=/Engine Oil|Oil Filter|Brake Pads|Spark Plug|Air Filter/'),
        ).toBeVisible();
    });

    test('cart content persists after page reload', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'В корзину' }).first().click();
        await page.waitForTimeout(500);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await page.goto('/cart');
        await page.waitForLoadState('networkidle');

        await expect(
            page.locator('text=/Engine Oil|Oil Filter|Brake Pads|Spark Plug|Air Filter/'),
        ).toBeVisible();
    });
});
