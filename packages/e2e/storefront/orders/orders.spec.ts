import { test, expect, type Page } from '@playwright/test';
import { placeTestOrder } from './helpers';

async function goToOrders(page: Page): Promise<void> {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({ timeout: 20000 });
}

test.describe('Orders page', () => {
    test('orders page loads and shows title', async ({ page }) => {
        await goToOrders(page);
    });

    test('orders page shows filter chips', async ({ page }) => {
        await goToOrders(page);
        await expect(page.getByRole('button', { name: 'All orders' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'In progress' })).toBeVisible();
    });

    test('placed order appears in orders list', async ({ page }) => {
        await placeTestOrder(page);
        await goToOrders(page);
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });
    });

    test('order card shows ERP status badge', async ({ page }) => {
        await goToOrders(page);
        const firstCard = page.locator('.order-card').first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        await expect(firstCard.locator('.status-pill')).toBeVisible();
    });

    test('Open button navigates to order detail page', async ({ page }) => {
        await goToOrders(page);
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.order-card').first().getByRole('link', { name: 'Open' }).click();
        await expect(page).toHaveURL(/\/orders\/[a-zA-Z0-9]+$/, { timeout: 10000 });
    });
});

test.describe('Order detail page', () => {
    let orderId: string;

    test.beforeAll(async ({ browser }) => {
        // auth path is relative to e2e package root (where playwright.config.ts lives)
        const ctx = await browser.newContext({
            storageState: '.auth/storefront-user.json',
        });
        const page = await ctx.newPage();
        orderId = (await placeTestOrder(page)).id;
        await ctx.close();
    });

    test('detail page shows order code', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-title')).toBeVisible({ timeout: 10000 });
        const title = await page.locator('.od-title').textContent();
        expect(title).toMatch(/Order\s+[A-Z0-9-]+/);
    });

    test('detail page shows order lines', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('detail page shows summary totals', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-summary-total')).toBeVisible({ timeout: 10000 });
    });

    test('back link returns to orders list', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.od-back').click();
        await expect(page).toHaveURL(/\/orders$/, { timeout: 10000 });
    });
});
