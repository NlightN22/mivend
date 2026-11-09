import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

test('status chips carry counts and Awaiting confirmation comes first @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/orders');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('Awaiting confirmation', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saved views' })).toHaveCount(0);
    await expect(page.getByTestId('orders-kpis')).toHaveCount(0);
});

test('the seven main columns fit the page width untruncated @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto('/orders');
    const columns = ['Order #', 'Date', 'Customer', 'Manager', 'Status', 'Total', 'Placed by'];
    // The manager role sees only its own orders, so the Manager column is hidden for it.
    const shown = test.info().project.name.endsWith('-manager')
        ? columns.filter(c => c !== 'Manager')
        : columns;
    for (const name of shown) {
        await expect(page.getByRole('columnheader', { name: new RegExp(name) })).toBeInViewport({
            timeout: 15000,
        });
    }
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 15000 });
    const clipped = await page.evaluate(
        () =>
            [...document.querySelectorAll('[role=grid] *, table *')].filter(
                el =>
                    getComputedStyle(el).textOverflow === 'ellipsis' &&
                    el.scrollWidth > el.clientWidth,
            ).length,
    );
    expect(clipped).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        1360,
    );
});

test('status chips wrap to two rows, More reveals the rest and none overlaps @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto('/orders');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toBeVisible({ timeout: 15000 });

    const row = page.locator('.mv-filter-chips').first();
    expect((await row.boundingBox())?.height ?? 0).toBeLessThanOrEqual(69);
    const toggle = page.locator('.mv-filter-chips__toggle');
    if (await toggle.isVisible()) {
        await toggle.click();
        await expect(toggle).toHaveText('Collapse');
        await expect(chips.last()).toBeInViewport();
        await toggle.click();
        await expect(toggle).toHaveText('More');
        await toggle.click();
    }

    const count = await chips.count();
    const boxes = [];
    for (let i = 0; i < count; i++) boxes.push(await chips.nth(i).boundingBox());
    for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1];
        const cur = boxes[i];
        if (prev && cur && cur.y < prev.y + prev.height - 1)
            expect(cur.x).toBeGreaterThanOrEqual(prev.x + prev.width - 1);
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
    const panel = page.getByTestId('table-views-panel');
    await panel.getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(/view=overdue/);

    await page.getByTestId('table-views-trigger').click();
    await page.locator('.mv-table-views__item', { hasText: name }).getByTitle('Delete').click();
    await expect(panel.getByRole('button', { name, exact: true })).toHaveCount(0);
});

test('orders list shows the seeded order with customer, branch and INN @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await expect(page.getByPlaceholder('Search orders…')).toBeVisible({ timeout: 30000 });
    // Other runs keep adding orders, so search instead of relying on page one.
    await page.getByPlaceholder('Search orders…').fill(order.code);

    const row = page.getByRole('row').filter({ hasText: order.displayCode });
    await expect(row).toBeVisible();
    await expect(row).toContainText('E2E Co');
    await expect(row).toContainText('INN 5100000001');
    await expect(row).not.toContainText(/INN —/);
});

test('orders list row click opens the order card @read-only', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByPlaceholder('Search orders…').fill(order.code);
    // Header plus one row: the filtered list has replaced the unfiltered one before the click.
    await expect(page.getByRole('row')).toHaveCount(2, { timeout: 15000 });
    await page.getByRole('row').filter({ hasText: order.displayCode }).getByText('E2E Co').click();

    await expect(page).toHaveURL(new RegExp(`/orders/${order.code}$`), { timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible();
});

test('orders list order number is a link to the order card @read-only', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByPlaceholder('Search orders…').fill(order.code);
    await expect(page.getByRole('row')).toHaveCount(2, { timeout: 15000 });
    const link = page.getByRole('link', { name: order.displayCode });
    await expect(link).toHaveAttribute('href', new RegExp(`/orders/${order.code}$`));
    await link.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/orders/${order.code}$`), { timeout: 30000 });
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

test('the Filter builder narrows the list by a column, shows a chip and survives a reload @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto('/orders');
    await page.getByTestId('filter-trigger').click();
    await page.getByTestId('filter-column-code').click();
    await page.getByTestId('filter-operator').selectOption('eq');
    await page.getByTestId('filter-value').fill(order.code);
    await page.getByRole('button', { name: 'Apply filter' }).click();

    const chip = page.getByTestId('filter-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('Order # is equal to');
    await expect(page.getByRole('row').filter({ hasText: order.displayCode })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page).toHaveURL(/filters=code/);

    await page.reload();
    await expect(page.getByTestId('filter-chip')).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: order.displayCode })).toBeVisible();

    await page
        .getByTestId('filter-chip')
        .getByRole('button', { name: /Remove/ })
        .click();
    await expect(page.getByTestId('filter-chip')).toHaveCount(0);
    await expect(page).not.toHaveURL(/filters=/);
});

test('a number condition with no match shows the empty state and a chip can be edited @read-only', async ({
    page,
}) => {
    await page.goto('/orders');
    await page.getByTestId('filter-trigger').click();
    await page.getByTestId('filter-column-total').click();
    await page.getByTestId('filter-operator').selectOption('gt');
    await page.getByTestId('filter-value').fill('999999999');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByText('No orders match your filters')).toBeVisible();

    await page.getByTestId('filter-chip').getByRole('button').first().click();
    await page.getByTestId('filter-operator').selectOption('between');
    await page.getByTestId('filter-value-from').fill('0');
    await page.getByTestId('filter-value-to').fill('999999999');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByTestId('filter-chip')).toContainText('Total 0 – 999999999');
    await expect(page.getByText('No orders match your filters')).toBeHidden();
});

test('the Filter panel opens as a bottom sheet on a phone and stays inside the viewport @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/orders');
    await page.getByTestId('filter-trigger').click();
    const box = await page.getByTestId('filter-panel').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
});
