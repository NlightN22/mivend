import { test, expect } from '@playwright/test';
import { placeTestOrder } from './helpers';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';

finishOrdersPlacedInEachTest();

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

async function postStatus(
    page: import('@playwright/test').Page,
    code: string,
    status: string,
): Promise<void> {
    const res = await page.request.post(`${SERVER_URL}/erp/callback/order-status`, {
        // erpOrderId is unique per order, so each run uses its own.
        data: { orderCode: code, status, erpOrderId: `E2E-${code}` },
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

        await postStatus(page, code, 'UNDER_APPROVAL');
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-status')).toHaveText('На согласовании', {
            timeout: 10000,
        });

        await postStatus(page, code, 'SHIPPING');
        // The callback is applied asynchronously via the event bus.
        await expect(async () => {
            await page.reload();
            await expect(page.locator('.od-status')).toHaveText('В пути', { timeout: 2000 });
        }).toPass({ timeout: 15000 });

        await page.goto('/orders');
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.order-card', { hasText: code.replace(/^(\d{3})/, '$1-') });
        await expect(card.locator('.status-pill')).toHaveText('В пути', { timeout: 10000 });
    });
});
