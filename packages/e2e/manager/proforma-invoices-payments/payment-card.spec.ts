import { test, expect } from '@playwright/test';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

test('a list row opens the payment card with its blocks and links @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    const first = page.locator(ROWS).first();
    await expect(first.getByRole('link').first()).toBeVisible({ timeout: 15000 });
    await first.locator('a[href^="/payments/"]').click();
    await expect(page).toHaveURL(/\/payments\/\d+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const title of ['Payment', 'Customer', 'Proforma invoice', 'Order'])
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Show in list' })).toBeVisible();
    await expect(page.locator('a[href^="/orders/"]').first()).toBeVisible();
});

test('clicking a row outside its links opens the card @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    const first = page.locator(ROWS).first();
    await expect(first.getByRole('link').first()).toBeVisible({ timeout: 15000 });
    await first.locator('td').nth(2).click();
    await expect(page).toHaveURL(/\/payments\/\d+$/);
});

test('an unknown or malformed payment id shows not found, not an error @on:manager-operator @read-only', async ({
    page,
}) => {
    for (const id of ['999999999', 'abc', "1'; --"]) {
        await page.goto(`/payments/${encodeURIComponent(id)}`);
        await expect(page.getByRole('heading', { name: 'Payment not found' })).toBeVisible({
            timeout: 15000,
        });
    }
});

test('Show in list returns to the list filtered by the payment number @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    const first = page.locator(ROWS).first();
    await expect(first.getByRole('link').first()).toBeVisible({ timeout: 15000 });
    await first.locator('a[href^="/payments/"]').click();
    await page.getByRole('link', { name: 'Show in list' }).click();
    await expect(page).toHaveURL(/\/payments\?.*search=/);
});
