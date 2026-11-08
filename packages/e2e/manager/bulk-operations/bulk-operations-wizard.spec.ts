import { test, expect } from '@playwright/test';

// Activate customers on the shared wizard; only reviews and skipped rows are asserted, so nothing is granted.
test.describe('bulk operations wizard (#337) @on:manager-portal-admin', () => {
    test('the catalog lists the operation and the History tab opens', async ({ page }) => {
        await page.goto('/bulk-operations');
        await expect(page.getByRole('link', { name: /Activate customers/ })).toBeVisible();
        await page.getByRole('link', { name: 'History', exact: true }).click();
        await expect(page).toHaveURL(/\/bulk-operations\/history/);
        await expect(page.getByPlaceholder('Search batch number…')).toBeVisible();
    });

    test('the old activation links keep working', async ({ page }) => {
        await page.goto('/bulk-operations/activate-customers');
        await expect(page).toHaveURL(/\/bulk-operations\/counterparty-portal-access/);
        await page.goto('/bulk-operations/counterparty-activation');
        await expect(page).toHaveURL(/\/bulk-operations\/counterparty-portal-access/);
    });

    test('Select all takes the page, Next is blocked without a selection, review lists skips with reasons', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access?pageSize=10');
        const footer = page.locator('footer');
        await expect(footer.getByRole('button', { name: 'Next' })).toBeDisabled();
        await expect(footer.getByText('Select at least one record')).toBeVisible();

        await page.getByRole('button', { name: /^Select all \(\d+\)$/ }).click();
        await expect(page.getByText(/^\d+ selected$/)).toBeVisible();
        await footer.getByRole('button', { name: 'Next' }).click();

        await page.getByText('Revoke portal access').click();
        await footer.getByRole('button', { name: 'Review' }).click();
        await expect(
            page.getByText('Nothing has changed yet').or(page.getByText('Nothing would change')),
        ).toBeVisible({
            timeout: 15000,
        });
        await page
            .getByRole('button', { name: /Skipped/ })
            .first()
            .click();
        await expect(page.locator('.mv-batch-result__table')).toBeVisible();

        await footer.getByRole('button', { name: 'Back' }).click();
        await expect(page.getByText('What to do with the selected counterparties')).toBeVisible();
    });
});
