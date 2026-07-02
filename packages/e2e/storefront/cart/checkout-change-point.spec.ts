import { test, expect, type Page } from '@playwright/test';

const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:5173';

async function ensureItemInCart(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row, .mv-product-card').first()).toBeVisible({
        timeout: 10000,
    });
    const addBtn = page.getByRole('button', { name: /^\+\s*Add$|^Add to cart$/ }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
        await page.request.post(`${STOREFRONT}/shop-api`, {
            data: { query: 'mutation { removeAllOrderLines { __typename } }' },
            headers: { 'Content-Type': 'application/json' },
        });
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row, .mv-product-card').first()).toBeVisible({
            timeout: 10000,
        });
    }
    await page
        .getByRole('button', { name: /^\+\s*Add$|^Add to cart$/ })
        .first()
        .click();
    await page.waitForTimeout(400);
}

async function openCheckout(page: Page): Promise<void> {
    await ensureItemInCart(page);
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.delivery-selector')).toBeVisible({ timeout: 10000 });
}

test.describe('Checkout — change trading point', () => {
    test('"Change point" button is visible on checkout', async ({ page }) => {
        await openCheckout(page);
        await expect(page.getByRole('button', { name: 'Change point' })).toBeVisible();
    });

    test('clicking "Change point" opens modal with trading point list', async ({ page }) => {
        await openCheckout(page);
        await page.getByRole('button', { name: 'Change point' }).click();

        await expect(page.locator('.mv-modal')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.ds-point-item')).toHaveCount(3, { timeout: 8000 });
    });

    test('modal shows seed trading points', async ({ page }) => {
        await openCheckout(page);
        await page.getByRole('button', { name: 'Change point' }).click();
        await expect(page.locator('.ds-point-item')).toHaveCount(3, { timeout: 8000 });

        const modal = page.locator('.mv-modal');
        await expect(modal.getByText('E2E Trading Point')).toBeVisible();
        await expect(modal.getByText('E2E North Depot')).toBeVisible();
        await expect(modal.getByText('E2E Warehouse')).toBeVisible();
    });

    test('selecting a point closes the modal', async ({ page }) => {
        await openCheckout(page);
        await page.getByRole('button', { name: 'Change point' }).click();
        await expect(page.locator('.mv-modal')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.ds-point-item')).toHaveCount(3, { timeout: 8000 });

        // Pick a point that is not currently active
        const items = page.locator('.ds-point-item');
        const nonActive = items.filter({ hasNot: page.locator('.ds-point-item--active') }).first();
        await nonActive.click();

        await expect(page.locator('.mv-modal')).not.toBeVisible({ timeout: 8000 });
    });

    test('selected point name appears in delivery card after change', async ({ page }) => {
        await openCheckout(page);
        await page.getByRole('button', { name: 'Change point' }).click();
        await expect(page.locator('.ds-point-item')).toHaveCount(3, { timeout: 8000 });

        // Pick 'E2E Warehouse' which has a distinct address
        await page.locator('.ds-point-item').filter({ hasText: 'E2E Warehouse' }).click();
        await expect(page.locator('.mv-modal')).not.toBeVisible({ timeout: 8000 });

        // Delivery card courier note should now reference the new address
        await expect(page.locator('.delivery-selector__card-note').first()).toContainText(
            'Warehouse Rd',
            { timeout: 5000 },
        );
    });

    test('closing modal via ✕ keeps current point unchanged', async ({ page }) => {
        await openCheckout(page);

        const noteBefore = await page
            .locator('.delivery-selector__card-note')
            .first()
            .textContent();

        await page.getByRole('button', { name: 'Change point' }).click();
        await expect(page.locator('.mv-modal')).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: 'Close' }).click();

        await expect(page.locator('.mv-modal')).not.toBeVisible();
        await expect(page.locator('.delivery-selector__card-note').first()).toHaveText(
            noteBefore ?? '',
        );
    });
});
