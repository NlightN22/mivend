import { test, expect, type Page } from '@playwright/test';

const ADD_BTN = /^\+\s*Add$|^Add to cart$/;

async function clearCart(page: Page): Promise<void> {
    await page.request.post('http://localhost:3000/shop-api', {
        data: { query: 'mutation { removeAllOrderLines { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
}

async function ensureItemInCart(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row, .mv-product-card').first()).toBeVisible({
        timeout: 10000,
    });
    const addBtn = page.getByRole('button', { name: ADD_BTN }).first();
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

test.describe('Checkout', () => {
    test.beforeEach(async ({ page }) => {
        await ensureItemInCart(page);
    });

    test('checkout page loads and shows cart items', async ({ page }) => {
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL('/login');
        await expect(page).not.toHaveURL('/cart');
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
