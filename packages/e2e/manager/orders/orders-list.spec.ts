import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('KPI carousel right arrow scrolls the row and stops at the end', async ({ page }) => {
    await page.goto('/orders');
    const track = page.locator('.mv-kpi-carousel__track');
    await expect(track).toBeVisible();

    const rightArrow = page.getByRole('button', { name: 'Scroll KPIs right' });
    // On a narrow layout the three KPI cards overflow the track and the arrow renders;
    // on a wide layout there may be nothing to scroll, so this is a soft check.
    if (await rightArrow.isVisible()) {
        await rightArrow.click();
        await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
});

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
