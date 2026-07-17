import { test, expect } from '@playwright/test';

test('invoices page loads and shows rows for an all-scope account', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator('.el-table-v2__row').first()).toBeVisible({ timeout: 15000 });
});

test('payments page loads and shows rows for an all-scope account', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator('.el-table-v2__row').first()).toBeVisible({ timeout: 15000 });
});

test('customer detail Invoices tab shows a "View all" link that pre-filters the standalone page', async ({
    page,
}) => {
    await page.goto('/customers/2');
    await page.getByRole('button', { name: 'Invoices' }).click();
    await page.getByRole('button', { name: 'View all invoices' }).click();

    await expect(page).toHaveURL(/\/invoices\?counterpartyId=2/);
    await expect(page.getByText('Filtered to one customer')).toBeVisible({ timeout: 15000 });
});
