import { test, expect } from '@playwright/test';

const ROW_LINKS = '.mv-advanced-data-table__grid tbody tr a';

test('status chips carry counts and All comes first @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('All', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(page.getByRole('button', { name: /^Captured \d+$/ })).toBeVisible();
});

test('a status chip lives in the URL and filters on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Captured \d+$/ }).click();
    await expect(page).toHaveURL(/view=captured/);
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr').first()).toBeVisible();
    await expect(page.getByText('Failed', { exact: true })).toHaveCount(0);
});

test('the Filter builder and a sortable header narrow and order the list on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments?sortField=amount&sortDir=ASC');
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('button', { name: /Filter/ })
        .first()
        .click();
    await page.getByText('Amount', { exact: true }).last().click();
    await page.locator('select').last().selectOption({ label: 'is greater than' });
    await page.getByPlaceholder('Value').fill('0');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page).toHaveURL(/filters=amount/);
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('columnheader', { name: /Amount/ })
        .getByRole('button')
        .click();
    await expect(page).toHaveURL(/sortDir=DESC/);
});

test('a row links to its order and customer @on:manager-operator @read-only', async ({ page }) => {
    await page.goto('/payments');
    const first = page.locator('.mv-advanced-data-table__grid tbody tr').first();
    await expect(first.getByRole('link').first()).toBeVisible({ timeout: 15000 });
    await expect(first.locator('a[href^="/customers/"]')).toBeVisible();
    await expect(first.locator('a[href^="/orders/"]')).toBeVisible();
});

test('the list paginates on the server @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/payments');
    const nextButton = page.getByRole('button', { name: 'Next Page' });
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(ROW_LINKS).first()).toBeVisible();
});

test('on a phone each payment is a card @on:manager-operator @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/payments');
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});
