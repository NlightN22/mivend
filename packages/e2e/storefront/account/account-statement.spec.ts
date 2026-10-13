import { test, expect } from '@playwright/test';

// Settlement rows can only arrive through the Kafka ingestion path, which e2e does not run, so
// this covers the navigation and the fail-closed empty state; the visibility matrix and the
// isolation between counterparties live in plugins/settlement integration tests.
test.describe('Account statement section', () => {
    test('the documents group collapses and opens, and the statement page is reachable', async ({
        page,
    }) => {
        await page.goto('/orders');

        const statement = page.getByRole('link', { name: 'Account statement' });
        await expect(statement).toBeVisible();
        await expect(page.getByRole('link', { name: 'Payments', exact: true })).toHaveCount(0);

        const group = page.getByRole('button', { name: 'Documents' });
        await expect(group).toHaveAttribute('aria-expanded', 'false');
        await group.click();
        await expect(group).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('link', { name: 'Proforma invoices' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Contracts and files' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Reconciliation acts' })).toBeVisible();

        await statement.click();
        await expect(page.getByRole('heading', { name: 'Account statement' })).toBeVisible();
    });

    test('shows nothing to a customer while no document type is customer-visible', async ({
        page,
    }) => {
        await page.goto('/settlements');

        await expect(page.getByRole('heading', { name: 'Account statement' })).toBeVisible();
        await expect(page.getByText('No documents found.')).toBeVisible();
    });

    test('reconciliation acts is a placeholder', async ({ page }) => {
        await page.goto('/reconciliation-acts');

        await expect(page.getByText('Not implemented yet.')).toBeVisible();
    });
});
