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

    test('the select step is the standard list: chips, Filter builder, Views and URL sync', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access');
        await expect(page.getByTestId('filter-trigger')).toBeVisible();
        await expect(page.getByTestId('table-views-trigger')).toBeVisible();
        await expect(page.locator('.p-datatable-filter')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Ready to activate/ })).toBeVisible();

        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-inn').click();
        await page.getByTestId('filter-operator').selectOption('contains');
        await page.getByTestId('filter-value').fill('zzz-no-such-inn');
        await page.getByRole('button', { name: 'Apply filter' }).click();
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await expect(page.getByText('No counterparties match your filters')).toBeVisible();
        await expect(page).toHaveURL(/filters=inn/);

        await page.reload();
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await page
            .getByTestId('filter-chip')
            .getByRole('button', { name: /Remove/ })
            .click();
        await expect(page.getByTestId('filter-chip')).toHaveCount(0);
        await expect(page).not.toHaveURL(/filters=/);
    });

    test('a readiness chip filters the list and a saved view brings it back', async ({ page }) => {
        const name = `e2e activation view ${Date.now()}`;
        await page.goto('/bulk-operations/counterparty-portal-access?view=activated');
        await page.getByTestId('table-views-trigger').click();
        await page.getByTestId('table-views-name').fill(name);
        await page.getByTestId('table-views-save').click();
        await expect(page.getByTestId('table-views-trigger')).toContainText(name);

        await page.goto('/bulk-operations/counterparty-portal-access?view=all');
        await page.getByTestId('table-views-trigger').click();
        const panel = page.getByTestId('table-views-panel');
        await panel.getByRole('button', { name, exact: true }).click();
        await expect(page).toHaveURL(/view=activated/);

        await page.getByTestId('table-views-trigger').click();
        await page.locator('.mv-table-views__item', { hasText: name }).getByTitle('Delete').click();
        await expect(panel.getByRole('button', { name, exact: true })).toHaveCount(0);
    });

    test('on a phone the select step is a card list and Select all still works', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/bulk-operations/counterparty-portal-access?pageSize=10');
        await expect(page.getByRole('table')).toHaveCount(0);
        await page.getByRole('button', { name: /^Select all \(\d+\)$/ }).click();
        await expect(page.getByText(/^\d+ selected$/)).toBeVisible();
    });
});
