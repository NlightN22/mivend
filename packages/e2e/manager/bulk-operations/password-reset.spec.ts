import { test, expect } from '@playwright/test';
import { INN_TWIN_A, INN_UNIQUE } from '../../fixtures/seed-inn';

// Twin A has a seeded login and Unique has none (fixtures/seed-inn.ts); mails are covered server-side.
test.describe('bulk password reset (#375) @on:manager-portal-admin', () => {
    test('a counterparty without a login is skipped with the reason and one with a login is applied', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-password-reset');
        await page.getByPlaceholder('Search company, legal name or INN…').fill('E2E INN');
        const withLogin = page.locator('tr', { hasText: INN_TWIN_A.shortName });
        const without = page.locator('tr', { hasText: INN_UNIQUE.shortName });
        await expect(without).toBeVisible({ timeout: 15000 });
        await withLogin.locator('td').first().click();
        await without.locator('td').first().click();

        const footer = page.locator('footer');
        await footer.getByRole('button', { name: 'Next' }).click();
        await expect(
            page.getByText(/Sends each selected counterparty a new password link/),
        ).toBeVisible();
        await footer.getByRole('button', { name: 'Review' }).click();
        await expect(page.getByText(/1 of 2 records will change; 1 will be skipped/)).toBeVisible({
            timeout: 15000,
        });
        await footer.getByRole('button', { name: 'Run batch' }).click();

        const counters = page.getByRole('group', { name: 'Counters' });
        await expect(counters.getByRole('button', { name: /^1\s*Applied$/ })).toBeVisible({
            timeout: 60000,
        });
        await counters.getByRole('button', { name: /^1\s*Skipped$/ }).click();
        const table = page.locator('.mv-batch-result__table');
        await expect(table).toContainText(INN_UNIQUE.shortName);
        await expect(table).toContainText('No portal login to reset');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    });
});
