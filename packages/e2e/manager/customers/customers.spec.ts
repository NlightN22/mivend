import { test, expect } from '@playwright/test';

test('customers page shows the client list with company meta and KPIs', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active clients')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();

    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await expect(row).toBeVisible();
});

test('customers page CSV export downloads a file', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('customers.csv');
});

test('clicking a customer row navigates to the customer detail page', async ({ page }) => {
    await page.goto('/customers');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });

    await expect(page).toHaveURL(/\/customers\/.+/);
});
