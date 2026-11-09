import { test, expect } from '@playwright/test';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

// The list reads the DiscountRegistryEntry projection, filtered and sorted by the shared list engine.
test('the page is titled Discounts and the first column is the numeric number @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Discounts', exact: true })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`${ROWS} td`).first()).toHaveText(/^\d{3}-\d{7}$/);
    await expect(page.getByRole('columnheader').first()).toContainText('Discount #');
    await expect(page.getByRole('columnheader').nth(1)).toContainText('Date');
});

test('the menu says Discounts, not Discount requests @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Discounts' }).first()).toBeAttached({
        timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Discount requests' })).toHaveCount(0);
});

test('search on the number narrows the list on the server and lives in the URL @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    const number = (await page.locator(`${ROWS} td`).first().innerText()).trim();
    await page.getByPlaceholder('Number or customer…').fill(number);
    await expect(page).toHaveURL(/search=/);
    await expect(page.locator(ROWS)).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator(`${ROWS} td`).first()).toHaveText(number);

    await page.getByPlaceholder('Number or customer…').fill('zzz-no-match-xyz');
    await expect(page.getByText('No discounts match your filters')).toBeVisible({
        timeout: 10000,
    });
});

test('status chips carry counts, live in the URL and filter on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('All', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);

    await page.getByRole('button', { name: /^Pending approval \d+$/ }).click();
    await expect(page).toHaveURL(/view=pending/);
    const badges = page.locator(`${ROWS} .mv-status-badge`);
    await expect(badges.first()).toBeVisible({ timeout: 15000 });
    const count = await badges.count();
    for (let i = 0; i < count; i++) await expect(badges.nth(i)).toHaveText('Pending approval');
});

test('the Filter builder narrows the list and the condition lives in the URL @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('button', { name: /Filter/ })
        .first()
        .click();
    await page.getByText('Discount %', { exact: true }).last().click();
    await page.locator('select').last().selectOption({ label: 'is greater than' });
    await page.getByPlaceholder('Value').fill('0');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page).toHaveURL(/filters=percent/);
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
});

test('a row click opens the discount request @on:manager-operator @read-only', async ({ page }) => {
    await page.goto('/discounts?view=pending');
    const row = page.locator(ROWS).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.locator('td').nth(2).click();
    await expect(page).toHaveURL(/\/approvals\/\d+/);
});

test('on a phone each discount is a card @on:manager-operator @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/discounts');
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});

test('paging keeps the page in the URL and does not snap the window to the top @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/discounts');
    const next = page.getByRole('button', { name: 'Next' }).last();
    await expect(page.getByText(/Page 1 of ([2-9]|\d{2,})/).first()).toBeVisible({
        timeout: 15000,
    });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
