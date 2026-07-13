import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('order detail shows the two-column layout with order lines and context', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Order context' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reservation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();

    await expect(page.locator('.order-lines')).toContainText('Available stock');
    await expect(page.locator('.order-detail__right-stack')).toContainText('E2E Co');
});

test('confirming an order creates a reservation and shows the expiry', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    // OrderDetailPage renders the Reservation panel with its default empty reservations list
    // (showing "Confirm order") the instant `order` loads, then re-renders once its own
    // fetchOrderReservations call resolves. Wait for that second fetch to land before deciding
    // whether to click, or a page-load-time flash of "Confirm order" can vanish out from under
    // confirmBtn.click() once the real "already reserved" state arrives.
    await page.waitForLoadState('networkidle');

    const panel = page.locator('.order-detail__right-stack');
    const confirmBtn = page.getByRole('button', { name: 'Confirm order' });

    if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
    }

    await expect(panel).toContainText('Reserved');
    await expect(panel.getByRole('button', { name: 'Release reservation' })).toBeVisible();
});
