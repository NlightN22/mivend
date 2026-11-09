import { test, expect } from '@playwright/test';

test('proforma invoices page loads and shows rows for an all-scope account @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    await expect(page.getByRole('heading', { name: 'Proforma invoices', exact: true })).toBeVisible(
        {
            timeout: 15000,
        },
    );
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr a').first()).toBeVisible({
        timeout: 15000,
    });
});

test('payments page loads and shows rows for an all-scope account @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr a').first()).toBeVisible({
        timeout: 15000,
    });
});

// The customer tab lists its proforma invoices in place; the standalone page keeps the deep link.
test('proforma invoices page pre-filters to one customer from the counterpartyId link @on:manager-operator @read-only', async ({
    page,
}) => {
    // The seeded e2e counterparty is the one every role project can see.
    await page.goto('/customers?search=E2E%20Co');
    await page
        .locator('.el-table-v2__row', { hasText: 'E2E Co' })
        .click({ position: { x: 20, y: 10 }, timeout: 15000 });
    await expect(page).toHaveURL(/\/customers\/\d+/);
    const counterpartyId = new URL(page.url()).pathname.split('/').pop();

    await page.goto(`/proforma-invoices?counterpartyId=${counterpartyId}`);
    await expect(page.getByText('Filtered to one customer')).toBeVisible({ timeout: 15000 });
});
