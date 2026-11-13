import { test, expect } from '@playwright/test';

// The History tab filters through the shared Filter builder (#344); the header funnels are gone.
test.describe('customer History tab — Filter builder @on:manager-portal-admin @read-only', () => {
    async function openHistoryTab(page: import('@playwright/test').Page): Promise<void> {
        await page.goto('/customers?search=E2E%20Co');
        const row = page.getByRole('row').filter({ hasText: 'E2E Co' }).first();
        await row.waitFor({ timeout: 15000 });
        await row.getByRole('link', { name: /E2E Co/ }).click();
        await expect(page).toHaveURL(/\/customers\/.+/);
        await page.getByRole('button', { name: 'History' }).click();
        await expect(page.getByTestId('filter-trigger')).toBeVisible({ timeout: 15000 });
    }

    test('no column header funnels are left on the tab', async ({ page }) => {
        await openHistoryTab(page);
        await expect(page.locator('.p-datatable-column-filter-button')).toHaveCount(0);
    });

    test('a condition shows a chip, survives a reload and can be removed', async ({ page }) => {
        await openHistoryTab(page);

        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-summary').click();
        await page.getByTestId('filter-operator').selectOption('contains');
        await page.getByTestId('filter-value').fill('no-such-change-text');
        await page.getByRole('button', { name: 'Apply filter' }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await expect(page).toHaveURL(/history\.filters=/);

        await page.reload();
        await page.getByRole('button', { name: 'History' }).click();
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);

        await page
            .getByTestId('filter-chip')
            .getByRole('button', { name: /Remove/ })
            .click();
        await expect(page.getByTestId('filter-chip')).toHaveCount(0);
        await expect(page).not.toHaveURL(/history\.filters=/);
    });
});
