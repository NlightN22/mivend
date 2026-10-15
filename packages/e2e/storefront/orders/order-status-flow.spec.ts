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
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': process.env.ERP_CALLBACK_API_KEY ?? 'dev-callback-key-change-me-0000',
        },
    });
    expect(res.ok()).toBe(true);
}

test.describe('ERP order status flow', () => {
    // Order may carry a leftover erpStatus from a prior run (Vendure reuses the session's active order).
    // Two distinct statuses per callback verify the update without assuming a baseline value.
    test('order status badge updates after ERP callback', async ({ page }) => {
        const { id: orderId, code } = await placeTestOrder(page);
        expect(code).toBeTruthy();

        await postStatus(page, code, 'RESERVED');
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-status')).toHaveText('Reserved / Pending approval', {
            timeout: 10000,
        });

        await postStatus(page, code, 'SHIPPING');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-status')).toHaveText('Shipped', { timeout: 10000 });

        await page.goto('/orders');
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.order-card', { hasText: code });
        await expect(card.locator('.status-pill')).toHaveText('Shipped', { timeout: 10000 });
    });
});
