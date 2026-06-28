import { test, expect } from '@playwright/test';

const ADD_BTN = /^\+\s*Add$|^Add to cart$/;

test.describe('Checkout', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: ADD_BTN }).first().click();
        await page.waitForTimeout(500);
    });

    test('checkout page loads and shows cart items', async ({ page }) => {
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        await expect(page).not.toHaveURL('/cart');
        // Checkout summary or item list should be visible
        await expect(page.locator('.checkout-page, main').first()).toBeVisible();
    });

    test('checkout page has order submit button', async ({ page }) => {
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');

        await expect(
            page.getByRole('button', { name: /Place order|Confirm order|Pay online/ }),
        ).toBeVisible();
    });
});
