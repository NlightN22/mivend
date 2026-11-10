import { test, expect, type Page } from '@playwright/test';
import { INN_MISSING, INN_TWIN_A, INN_TWIN_B, INN_UNIQUE } from '../../fixtures/seed-inn';

// #225: a counterparty needs a unique inn before portal binding. Twin A is seeded already bound,
// so the refusals below create nothing and the specs are idempotent.
test.describe('counterparty INN guard (#225) @on:manager-portal-admin', () => {
    function row(page: Page, shortName: string): ReturnType<Page['locator']> {
        return page.locator('tr', { hasText: shortName });
    }

    test('bulk activation review skips a duplicate inn and a missing inn with a clear reason', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access');
        await page.getByPlaceholder('Search company, legal name or INN…').fill('E2E INN');
        await expect(row(page, INN_TWIN_B.shortName)).toBeVisible({ timeout: 15000 });
        await expect(row(page, INN_TWIN_A.shortName)).toContainText('Activated');

        for (const who of [INN_TWIN_B, INN_MISSING]) {
            await row(page, who.shortName).locator('td').first().click();
        }
        const footer = page.locator('footer');
        await footer.getByRole('button', { name: 'Next' }).click();
        await footer.getByRole('button', { name: 'Review' }).click();
        await expect(page.getByText('Nothing would change')).toBeVisible({ timeout: 15000 });

        const table = page.locator('.mv-batch-result__table');
        await expect(table).toContainText('INN is used by another counterparty with portal access');
        await expect(table).toContainText('INN is missing in the ERP');
        await expect(footer.getByRole('button', { name: 'Run batch' })).toBeDisabled();
    });

    test('the customer list filters counterparties with a duplicate or a missing inn', async ({
        page,
    }) => {
        await page.goto('/customers?filters=innStatus:eq:duplicate&search=E2E INN');
        await expect(page.getByText(INN_TWIN_A.shortName).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(INN_TWIN_B.shortName).first()).toBeVisible();
        await expect(page.getByText(INN_UNIQUE.shortName)).toHaveCount(0);
        await expect(page.getByText(INN_MISSING.shortName)).toHaveCount(0);

        await page.goto('/customers?filters=innStatus:eq:missing&search=E2E INN');
        await expect(page.getByText(INN_MISSING.shortName).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(INN_TWIN_B.shortName)).toHaveCount(0);
        await expect(page.getByText(INN_UNIQUE.shortName)).toHaveCount(0);
    });

    for (const [who, badge] of [
        [INN_TWIN_B, 'INN duplicate (ERP)'],
        [INN_MISSING, 'INN missing'],
        [INN_UNIQUE, null],
    ] as const) {
        test(`customer page of "${who.shortName}" ${badge ? `shows "${badge}"` : 'shows no INN problem'}`, async ({
            page,
        }) => {
            await page.goto(`/customers?search=${encodeURIComponent(who.shortName)}`);
            const listRow = page.getByRole('row').filter({ hasText: who.shortName }).first();
            await listRow.waitFor({ timeout: 15000 });
            await listRow.getByRole('link', { name: who.shortName }).click();
            await expect(page).toHaveURL(/\/customers\/.+/);
            await expect(page.getByRole('heading', { name: who.shortName })).toBeVisible();
            const notice = page.getByText(/INN (duplicate \(ERP\)|missing) —/);
            if (badge) await expect(notice).toContainText(badge);
            else await expect(notice).toHaveCount(0);
        });
    }
});
