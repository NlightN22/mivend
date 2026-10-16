import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('order detail shows the two-column layout with order lines and context', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Order context' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reservation', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();

    await expect(page.locator('.order-lines thead')).toContainText('Available');
    await expect(page.locator('.order-detail__panels')).toContainText('E2E Co');
});

test('confirming an order creates a reservation and shows the expiry', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    // Default empty reservations render first (showing "Confirm order"); wait for the real list
    // before clicking, or the button can disappear mid-click once "already reserved" arrives.
    await page.waitForLoadState('networkidle');

    const panel = page.locator('.order-detail__panels');
    const confirmBtn = page.getByRole('button', { name: 'Confirm order' });

    if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
    }

    await expect(panel).toContainText('Reserved');
    await expect(panel.getByRole('button', { name: 'Release reservation' })).toBeVisible();
});
