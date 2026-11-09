import { test, expect, type Page } from '@playwright/test';
import { adminGql, postBatch, waitForRun } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';

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

    test('the header checkbox takes the page, Next is blocked without a selection, review lists skips with reasons', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access?pageSize=10');
        const footer = page.locator('footer');
        await expect(footer.getByRole('button', { name: 'Next' })).toBeDisabled();
        await expect(footer.getByText('Select at least one record')).toBeVisible();

        await page.getByRole('checkbox').first().check();
        await expect(page.getByTestId('table-selection-count')).toHaveText(/^Selected \d+ of \d+$/);
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

    test('Branch and Manager quick filters edit the builder conditions and Reset clears them', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access');
        const branch = page.getByTestId('quick-filter-branch');
        await expect(branch.locator('option')).not.toHaveCount(2);
        await branch.selectOption({ index: 2 });
        await expect(page).toHaveURL(/filters=branch/);
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await page.getByTestId('quick-filter-reset').click();
        await expect(page).not.toHaveURL(/filters=/);
        await expect(page.getByTestId('filter-chip')).toHaveCount(0);
    });

    test('on a phone the select step is a card list with a page checkbox and the selection bar', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/bulk-operations/counterparty-portal-access?pageSize=10');
        await expect(page.getByRole('table')).toHaveCount(0);
        await page.getByLabel('Select this page').check();
        await expect(page.getByTestId('table-selection-count')).toHaveText(/^Selected \d+ of \d+$/);
        await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
    });
});

// Counterparties created through the ERP import REST of the e2e stack, not the demo seed; each test
// retires its own (inactive in the ERP) so later specs do not see them as ready to activate.
const RUN = Date.now().toString(36);

interface Created {
    search: string;
    retire: () => Promise<void>;
}

const innBase = (tag: string): string =>
    String([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100_000_000, 7)).padStart(8, '0');

async function importCounterparties(tag: string, count: number, isActive: boolean): Promise<void> {
    const records = Array.from({ length: count }, (_, i) => ({
        type: 'counterparty',
        data: {
            erpId: `e2e-bulkm-${tag}-${i}`,
            legalName: `E2E Bulk ${tag} ${String(i).padStart(3, '0')} LLC`,
            shortName: `E2E Bulk ${tag} ${String(i).padStart(3, '0')}`,
            inn: `78${innBase(tag)}${String(i).padStart(4, '0')}`,
            phone: '+7 900 000-02-00',
            officialEmail: `e2e-bulkm-${tag}-${i}@test.example`,
            creditLimit: 10000,
            creditBalance: 0,
            paymentDelayDays: 7,
            priceType: 'WHOLESALE',
            isActive,
            departmentId: 'dept-sales',
        },
    }));
    const run = await postBatch(`e2e-bulkm-${tag}-${isActive ? 'on' : 'off'}`, records);
    await waitForRun(run.runId, 180_000);
}

async function createReady(prefix: string, count: number): Promise<Created> {
    const tag = `${prefix}-${RUN}`;
    await importCounterparties(tag, count, true);
    return { search: `E2E Bulk ${tag}`, retire: () => importCounterparties(tag, count, false) };
}

async function counterpartyCount(search: string, readiness: string): Promise<number> {
    const token = await adminTokenFor(
        process.env.SUPERADMIN_USERNAME ?? 'superadmin',
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
    );
    const { data } = await adminGql<{ counterparties: { totalItems: number } }>(
        `query($o: CounterpartyListOptions) { counterparties(options: $o) { totalItems } }`,
        { o: { search, readiness, take: 1 } },
        token,
    );
    return data.counterparties.totalItems;
}

async function activateAllMatching(page: Page, search: string, total: number): Promise<void> {
    await page.goto(
        `/bulk-operations/counterparty-portal-access?pageSize=10&search=${encodeURIComponent(search)}`,
    );
    await expect(
        page.getByText(`1–10 of ${total}`).or(page.getByText(`1-10 of ${total}`)),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole('checkbox').first().check();
    await expect(page.getByTestId('table-selection-count')).toHaveText(`Selected 10 of ${total}`);
    await page.getByTestId('select-all-matching').click();
    await expect(page.getByTestId('table-selection-count')).toHaveText(`All ${total} selected`);

    const footer = page.locator('footer');
    await footer.getByRole('button', { name: 'Next' }).click();
    await footer.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByText(`${total} of ${total} records will change`)).toBeVisible({
        timeout: 30000,
    });
    await footer.getByRole('button', { name: 'Run batch' }).click();

    const counters = page.getByRole('group', { name: 'Counters' });
    await expect(counters.getByRole('button', { name: /Applied/ })).toContainText(String(total), {
        timeout: 120000,
    });
    await expect(counters.getByRole('button', { name: /^All/ })).toContainText(String(total));
    await expect(counters.getByRole('button', { name: /Failed/ })).toContainText('0');
}

test.describe('select all matching the filter (#337) @on:manager-portal-admin', () => {
    test.describe.configure({ mode: 'serial', timeout: 420000 });

    for (const [pages, total] of [
        [3, 30],
        [5, 50],
    ] as const) {
        test(`activates every one of ${total} counterparties spanning ${pages} pages and undoes it`, async ({
            page,
        }) => {
            const created = await createReady(`p${pages}`, total);
            const { search } = created;
            try {
                expect(await counterpartyCount(search, 'ready')).toBe(total);
                await activateAllMatching(page, search, total);
                expect(await counterpartyCount(search, 'activated')).toBe(total);
                expect(await counterpartyCount(search, 'ready')).toBe(0);
            } finally {
                const undo = page.getByRole('button', { name: 'Undo', exact: true });
                if (await undo.isVisible()) await undo.click();
                await expect
                    .poll(() => counterpartyCount(search, 'activated'), { timeout: 120000 })
                    .toBe(0);
                await created.retire();
            }
        });
    }

    test('a manual untick or a changed search leaves the all-matching mode with a message', async ({
        page,
    }) => {
        const created = await createReady('reset', 12);
        try {
            await page.goto(
                `/bulk-operations/counterparty-portal-access?pageSize=10&search=${encodeURIComponent(created.search)}`,
            );
            await page.getByRole('checkbox').first().check();
            await expect(page.getByTestId('filter-trigger')).toBeVisible();
            await page.getByTestId('select-all-matching').click();
            await expect(page.getByTestId('table-selection-count')).toHaveText('All 12 selected');
            await page.getByRole('checkbox').nth(1).uncheck();
            await expect(
                page.getByText(/selection of all matching records was reset/),
            ).toBeVisible();
            await expect(page.getByTestId('table-selection-count')).toHaveText('Selected 9 of 12');
            await page.getByRole('button', { name: 'Clear selection' }).click();
            await expect(page.getByTestId('table-selection-bar')).toHaveCount(0);
        } finally {
            await created.retire();
        }
    });
});
