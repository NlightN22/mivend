import { expect, test, type Page } from '@playwright/test';
import { TEAM_MEMBERS } from '../../fixtures/visibility/team';
import { openManagerAs } from '../../visibility/session';

const searchable = `${TEAM_MEMBERS.searchable.firstName} ${TEAM_MEMBERS.searchable.lastName}`;
const retired = `${TEAM_MEMBERS.retired.firstName} ${TEAM_MEMBERS.retired.lastName}`;

async function chipCount(page: Page, label: string): Promise<number> {
    const chip = page.getByRole('main').getByRole('button', { name: new RegExp(`^${label} \\d+`) });
    const text = (await chip.innerText()).trim();
    return Number(text.match(/(\d+)$/)?.[1]);
}

test.describe('Team directory', () => {
    test('search finds a member by name and by ERP id (operator)', async ({ browser }) => {
        const s = await openManagerAs(browser, 'operator-a');
        try {
            await s.page.goto('/team');
            const main = s.page.getByRole('main');
            const search = main.getByPlaceholder('Search by name or ERP id…');
            await search.fill('Searchable');
            await expect(main.getByText(searchable, { exact: true })).toBeVisible({
                timeout: 15000,
            });
            await search.fill(TEAM_MEMBERS.searchable.erpId);
            await expect(main.getByText(searchable, { exact: true })).toBeVisible();
            await search.fill('no-such-member-zzz');
            await expect(main.getByText('No employees match your filters')).toBeVisible();
        } finally {
            await s.context.close();
        }
    });

    test('the operator never sees a deactivated administrator or the Inactive chip', async ({
        browser,
    }) => {
        const s = await openManagerAs(browser, 'operator-a');
        try {
            await s.page.goto('/team');
            const main = s.page.getByRole('main');
            await expect(main.getByText(searchable, { exact: true })).toBeVisible({
                timeout: 15000,
            });
            await expect(main.getByText(retired, { exact: true })).toHaveCount(0);
            await expect(main.getByRole('button', { name: /^All \d+/ })).toBeVisible();
            await expect(main.getByRole('button', { name: /^Inactive/ })).toHaveCount(0);
            await main
                .getByPlaceholder('Search by name or ERP id…')
                .fill(TEAM_MEMBERS.retired.erpId);
            await expect(main.getByText('No employees match your filters')).toBeVisible({
                timeout: 15000,
            });
        } finally {
            await s.context.close();
        }
    });

    test('a lifecycle holder gets the Inactive chip, consistent counts', async ({ browser }) => {
        const s = await openManagerAs(browser, 'director');
        try {
            const { page } = s;
            await page.goto('/team');
            const main = page.getByRole('main');
            await expect(main.getByText(searchable, { exact: true })).toBeVisible({
                timeout: 15000,
            });
            const [all, active, unassigned, inactive] = await Promise.all(
                ['All', 'Active', 'Unassigned', 'Inactive'].map(l => chipCount(page, l)),
            );
            expect(inactive).toBeGreaterThanOrEqual(1);
            expect(all).toBe(active + unassigned + inactive);

            await main.getByRole('button', { name: /^Inactive/ }).click();
            await expect(main.getByText(retired, { exact: true })).toBeVisible({ timeout: 15000 });
            await expect(main.getByText(searchable, { exact: true })).toHaveCount(0);
        } finally {
            await s.context.close();
        }
    });

    test('the department column filter narrows the list', async ({ browser }) => {
        const s = await openManagerAs(browser, 'director');
        try {
            const { page } = s;
            await page.goto('/team');
            const main = page.getByRole('main');
            await expect(main.getByText('Petr Manager', { exact: true })).toBeVisible({
                timeout: 15000,
            });
            await main
                .locator('th')
                .filter({ hasText: 'Department' })
                .first()
                .locator('.p-datatable-filter button')
                .click();
            const overlay = page.locator('.p-datatable-filter-overlay');
            await overlay.locator('.mv-column-filter-select__trigger').click();
            await overlay
                .locator('.mv-column-filter-select__option')
                .filter({ hasText: 'E2E Vis department A' })
                .click();
            await expect(main.getByText(searchable, { exact: true })).toBeVisible({
                timeout: 15000,
            });
            await expect(main.getByText('Petr Manager', { exact: true })).toHaveCount(0);
        } finally {
            await s.context.close();
        }
    });
});
