import { test, expect } from '@playwright/test';

const ROW_LINKS = '.mv-advanced-data-table__grid tbody tr a';

test('status chips carry counts and All comes first @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('All', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(page.getByRole('button', { name: /^Current \d+$/ })).toBeVisible();
});

test('a status chip and the search live in the URL and filter on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Current \d+$/ }).click();
    await expect(page).toHaveURL(/view=current/);
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr').first()).toBeVisible();
    await expect(page.getByText('Superseded', { exact: true })).toHaveCount(0);
});

// The order card's "Proforma invoices" modal links here with the order code.
test('search from an order code link lists only that order proforma invoices @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const orderLink = page.locator(ROW_LINKS).first();
    await expect(orderLink).toBeVisible({ timeout: 15000 });
    const href = (await orderLink.getAttribute('href')) ?? '';
    const code = href.split('/').pop() ?? '';
    expect(code).not.toBe('');

    await page.goto(`/proforma-invoices?search=${code}`);
    const links = page.locator(ROW_LINKS);
    await expect(links.first()).toBeVisible({ timeout: 15000 });
    for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', `/orders/${code}`);
    }
});

test('the Filter builder and a sortable header narrow and order the list on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices?sortField=amount&sortDir=ASC');
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
    // Descending is the default direction, so the URL drops sortDir once the click flips ASC to DESC.
    await expect(page).not.toHaveURL(/sortDir=ASC/);
    await expect(page).toHaveURL(/sortField=amount/);
});

test('a row opens the order card @on:manager-operator @read-only', async ({ page }) => {
    await page.goto('/proforma-invoices');
    const first = page.locator('.mv-advanced-data-table__grid tbody tr').first();
    await expect(first.getByRole('link')).toBeVisible({ timeout: 15000 });
    await first.locator('td').first().click();
    await expect(page).toHaveURL(/\/orders\/\d+/);
});

test('the list paginates on the server @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/proforma-invoices');
    const nextButton = page.getByRole('button', { name: 'Next Page' });
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(ROW_LINKS).first()).toBeVisible();
});

test('on a phone each proforma invoice is a card @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/proforma-invoices');
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});
