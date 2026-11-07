import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('status chips carry counts and Awaiting confirmation comes first @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/orders');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('Awaiting confirmation', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saved views' })).toHaveCount(0);
    await expect(page.getByTestId('orders-kpis')).toHaveCount(0);
});

test('the seven main columns fit the page width without horizontal scroll @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto('/orders');
    for (const name of ['Order #', 'Date created', 'Customer', 'Status', 'Total', 'Placed by']) {
        await expect(page.getByRole('columnheader', { name: new RegExp(name) })).toBeInViewport({
            timeout: 15000,
        });
    }
});

test('a table view stores the chip and is recalled from the Views control', async ({ page }) => {
    const name = `e2e view ${Date.now()}`;
    await page.goto('/orders?view=overdue');
    await page.getByTestId('table-views-trigger').click();
    await page.getByTestId('table-views-name').fill(name);
    await page.getByTestId('table-views-save').click();
    await expect(page.getByTestId('table-views-trigger')).toContainText(name);

    await page.goto('/orders?view=all');
    await page.getByTestId('table-views-trigger').click();
    await page.getByRole('button', { name }).click();
    await expect(page).toHaveURL(/view=overdue/);

    await page.getByTestId('table-views-trigger').click();
    await page.locator('.mv-table-views__item', { hasText: name }).getByTitle('Delete').click();
    await expect(page.getByRole('button', { name })).toHaveCount(0);
});

test('orders list shows the seeded order with customer, branch and INN @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await expect(page.getByPlaceholder('Search orders…')).toBeVisible({ timeout: 15000 });
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
