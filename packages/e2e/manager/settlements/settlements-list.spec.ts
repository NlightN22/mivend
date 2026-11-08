import { test, expect } from '@playwright/test';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

test('type chips come from the data, carry counts and All comes first @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/settlements');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('All', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(chips.nth(1)).toContainText(/\d+$/);
});

test('a type chip lives in the URL and narrows the list on the server @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/settlements');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await page.locator('.mv-filter-chip').nth(1).click();
    await expect(page).toHaveURL(/view=(?!all)/);
    await expect(page.locator(ROWS).first()).toBeVisible();
});

test('the Filter builder and a sortable header narrow and order the list on the server @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/settlements?sortField=amount&sortDir=ASC');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('button', { name: /Filter/ })
        .first()
        .click();
    await page.getByText('Amount', { exact: true }).last().click();
    await page.locator('select').last().selectOption({ label: 'is greater than' });
    await page.getByPlaceholder('Value').fill('0');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page).toHaveURL(/filters=amount/);
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('columnheader', { name: /Amount/ })
        .getByRole('button')
        .click();
    await expect(page).toHaveURL(/sortDir=DESC/);
});

test('a row links to its customer @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.goto('/settlements');
    const first = page.locator(ROWS).first();
    await expect(first.locator('a[href^="/customers/"]')).toBeVisible({ timeout: 15000 });
});

test('the menu offers Settlements to a credit reader @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Settlements' }).first()).toBeVisible({
        timeout: 15000,
    });
});

test('on a phone each document is a card @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settlements');
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});
