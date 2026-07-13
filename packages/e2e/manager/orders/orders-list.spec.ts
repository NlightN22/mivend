import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('orders list shows the seeded order with customer, branch and INN', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await expect(page.getByText('Saved views')).toBeVisible({ timeout: 15000 });

    const row = page.locator('.el-table-v2__row', { hasText: order.code });
    await expect(row).toBeVisible();
    await expect(row).toContainText('E2E Co');
    await expect(row).toContainText('WHOLESALE');
});

test('orders list opens the order detail page on row click', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    const row = page.locator('.el-table-v2__row', { hasText: order.code });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });

    await expect(page).toHaveURL(new RegExp(`/orders/${order.code}$`));
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible();
});
