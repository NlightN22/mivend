import { test, expect, type Page } from '@playwright/test';
import { INN_MISSING, INN_TWIN_A, INN_TWIN_B, INN_UNIQUE } from '../../fixtures/seed-inn';

// #225: a counterparty needs a unique inn before portal binding. Twin A is seeded already bound,
// so the refusals below create nothing and the specs are idempotent.
test.describe('counterparty INN guard (#225)', () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-portal-admin', 'needs portal access rights');
    });

    function row(page: Page, shortName: string): ReturnType<Page['locator']> {
        return page.locator('tr', { hasText: shortName });
    }

    test('bulk activation refuses a duplicate inn and a missing inn with a clear message', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-activation');
        await page.getByPlaceholder('Search company name…').fill('E2E INN');
        await expect(row(page, INN_TWIN_B.shortName)).toBeVisible({ timeout: 15000 });
        await expect(row(page, INN_TWIN_A.shortName)).toContainText('Activated');

        for (const who of [INN_TWIN_B, INN_MISSING]) {
            await row(page, who.shortName).locator('td').first().click();
        }
        await expect(page.getByText('2 selected')).toBeVisible();
        await page.getByRole('button', { name: 'Activate portal access', exact: true }).click();
        await page.getByRole('button', { name: /Reset selection/ }).click();
        await page.getByRole('button', { name: /Save changes/ }).click();
        await page.getByRole('button', { name: 'Apply', exact: true }).click();

        const error = page.locator('.mv-notice').filter({ hasText: 'failed' });
        await expect(error).toContainText(
            `INN 7700000011 is already used by counterparty "${INN_TWIN_A.shortName}" (${INN_TWIN_A.erpId})`,
            { timeout: 15000 },
        );
        await expect(error).toContainText('merge the duplicates in the ERP first');
        await expect(error).toContainText(`Counterparty "${INN_MISSING.shortName}" has no INN`);
        await expect(row(page, INN_TWIN_B.shortName)).not.toContainText('Activated');
        await expect(row(page, INN_MISSING.shortName)).not.toContainText('Activated');
    });

    test('the customer list filters counterparties with a duplicate or a missing inn', async ({
        page,
    }) => {
        await page.goto('/customers?innStatus=duplicate&search=E2E INN');
        await expect(page.getByText(INN_TWIN_A.shortName).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(INN_TWIN_B.shortName).first()).toBeVisible();
        await expect(page.getByText(INN_UNIQUE.shortName)).toHaveCount(0);
        await expect(page.getByText(INN_MISSING.shortName)).toHaveCount(0);

        await page.goto('/customers?innStatus=missing&search=E2E INN');
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
            const listRow = page.locator('.el-table-v2__row', { hasText: who.shortName });
            await listRow.waitFor({ timeout: 15000 });
            await listRow.click({ position: { x: 20, y: 10 } });
            await expect(page).toHaveURL(/\/customers\/.+/);
            await expect(page.getByRole('heading', { name: who.shortName })).toBeVisible();
            const notice = page.getByText(/INN (duplicate \(ERP\)|missing) —/);
            if (badge) await expect(notice).toContainText(badge);
            else await expect(notice).toHaveCount(0);
        });
    }
});
