import { test, expect } from '@playwright/test';
import { placeTestOrder } from './helpers';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

async function postStatus(
    page: import('@playwright/test').Page,
    code: string,
    status: string,
): Promise<void> {
    const res = await page.request.post(`${SERVER_URL}/erp/callback/order-status`, {
        data: { orderCode: code, status, erpOrderId: 'E2E-DOC-1' },
        headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBe(true);
}

test.describe('ERP order status flow', () => {
    // Vendure keeps a single active order per session across repeated checkouts
    // (OrderPlacedEvent fires only once per order id), so the order's erpStatus
    // may carry over a leftover value from a previous run. Two callbacks with
    // distinct statuses verify the update mechanism without assuming a baseline.
    test('order status badge updates after ERP callback', async ({ page }) => {
        const { id: orderId, code } = await placeTestOrder(page);
        expect(code).toBeTruthy();

        await postStatus(page, code, 'RESERVED');
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-status')).toHaveText('Reserved / Pending approval', {
            timeout: 10000,
        });

        await postStatus(page, code, 'SHIPPED');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-status')).toHaveText('Shipped', { timeout: 10000 });

        await page.goto('/orders');
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.order-card', { hasText: code });
        await expect(card.locator('.status-pill')).toHaveText('Shipped', { timeout: 10000 });
    });
});
