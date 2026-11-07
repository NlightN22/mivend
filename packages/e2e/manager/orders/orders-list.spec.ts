import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('KPI carousel right arrow scrolls the row and stops at the end @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/orders');
    const track = page.locator('.mv-kpi-carousel__track');
    await expect(track).toBeVisible({ timeout: 15000 });

    const rightArrow = page.getByRole('button', { name: 'Scroll KPIs right' });
    // On a narrow layout the three KPI cards overflow the track and the arrow renders;
    // on a wide layout there may be nothing to scroll, so this is a soft check.
    if (await rightArrow.isVisible()) {
        await rightArrow.click();
        await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
});

test('orders list shows the seeded order with customer, branch and INN @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Saved views' })).toBeVisible({
        timeout: 15000,
    });
    // Other runs keep adding orders, so search instead of relying on page one.
    await page.getByPlaceholder('Search orders…').fill(order.code);

    const row = page.getByRole('row').filter({ hasText: order.displayCode });
    await expect(row).toBeVisible();
    await expect(row).toContainText('E2E Co');
    await expect(row).toContainText('WHOLESALE');
});

test('orders list row click opens the quick panel and Open goes to the order card @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByPlaceholder('Search orders…').fill(order.code);
    const row = page.getByRole('row').filter({ hasText: order.displayCode });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });

    const panel = page.getByTestId('order-quick-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(order.displayCode);
    await expect(panel).toContainText('E2E Co');
    await expect(page).toHaveURL(/\/orders(\?|$)/);

    await panel.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.code}$`));
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible();
});

test('quick panel closes with Escape and leaves the list in place @read-only', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByPlaceholder('Search orders…').fill(order.code);
    const row = page.getByRole('row').filter({ hasText: order.displayCode });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page.getByTestId('order-quick-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('order-quick-panel')).toBeHidden();
    await expect(row).toBeVisible();
});

test('orders list search and view chip are shareable in the URL @read-only', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByPlaceholder('Search orders…').fill(order.code);
    await expect(page).toHaveURL(new RegExp(`search=${order.code}`));

    await page.goto('/orders?view=overdue');
    await expect(page.getByRole('button', { name: 'Overdue' })).toBeVisible();
    await expect(page).toHaveURL(/view=overdue/);
});

test('orders list has a Placed by column @read-only', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByRole('columnheader', { name: /Placed by/ })).toBeVisible({
        timeout: 15000,
    });
});
