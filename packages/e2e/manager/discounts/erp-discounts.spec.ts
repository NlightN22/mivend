import { test, expect, type Page } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { MANAGER_ACCOUNTS } from '../../fixtures/accounts';
import { clientName } from '../../fixtures/visibility/plan';
import { setupNumber } from '../../fixtures/visibility/setups';

const ROWS = '.mv-advanced-data-table__grid tbody tr';
const SEARCH = 'Number or customer…';
const row = (page: Page, number: string) =>
    page.locator(ROWS).filter({ has: page.getByRole('cell', { name: number, exact: true }) });

interface Counts {
    all: number;
    running: number;
    expiringSoon: number;
    upcoming: number;
    expired: number;
    inactive: number;
}

async function apiCounts(): Promise<Counts> {
    const token = await adminTokenFor(
        MANAGER_ACCOUNTS.operator.username,
        MANAGER_ACCOUNTS.operator.password,
    );
    const { data } = await adminGql<{ discountSetupCounts: Counts }>(
        '{ discountSetupCounts { all running expiringSoon upcoming expired inactive } }',
        undefined,
        token,
    );
    return data.discountSetupCounts;
}

test('the ERP discounts list opens first with number, valid from, then the other columns @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    const headers = page.getByRole('columnheader');
    const expected = [
        'Discount #',
        'Valid from',
        'Customer',
        'Discount %',
        'Price type',
        'Products',
        'Valid to',
        'Status',
    ];
    for (const [i, name] of expected.entries()) await expect(headers.nth(i)).toContainText(name);
    await expect(page.getByPlaceholder(SEARCH)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
    );
});

test('the status chips carry the API counts and filter through the URL @on:manager-operator @read-only', async ({
    page,
}) => {
    const counts = await apiCounts();
    await page.goto('/discounts');
    await expect(page.getByRole('button', { name: `All ${counts.all}`, exact: true })).toBeVisible({
        timeout: 15000,
    });
    const labelled: [string, number][] = [
        ['Running', counts.running],
        ['Expiring soon', counts.expiringSoon],
        ['Upcoming', counts.upcoming],
        ['Expired', counts.expired],
        ['Inactive', counts.inactive],
    ];
    for (const [label, count] of labelled) {
        await expect(
            page.getByRole('button', { name: `${label} ${count}`, exact: true }),
        ).toBeVisible();
    }
    expect(counts.running).toBeGreaterThan(0);

    await page.getByRole('button', { name: `Running ${counts.running}`, exact: true }).click();
    await expect(page).toHaveURL(/erp\.view=running/);
    const badges = page.locator(`${ROWS} .mv-status-badge`);
    await expect(badges.first()).toBeVisible({ timeout: 15000 });
    for (const badge of await badges.all()) await expect(badge).toHaveText('Running');
});

test('searching a seeded document number narrows the list and lives in the URL @on:manager-operator @read-only', async ({
    page,
}) => {
    const number = setupNumber('own-b-expiring');
    await page.goto('/discounts');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder(SEARCH).fill(number);
    await expect(page).toHaveURL(/erp\.search=/);
    await expect(page.locator(ROWS)).toHaveCount(1, { timeout: 15000 });
    await expect(row(page, number).locator('.mv-status-badge')).toHaveText('Expiring soon');

    await page.getByPlaceholder(SEARCH).fill('zzz-no-match-xyz');
    await expect(page.getByText('No ERP discounts match your filters')).toBeVisible({
        timeout: 10000,
    });
});

test('a markup is shown with a plus sign and the company-wide setup says All customers @on:manager-operator @read-only', async ({
    page,
}) => {
    const markup = setupNumber('everyone-empty');
    await page.goto(`/discounts?erp.search=${markup}`);
    const r = row(page, markup);
    await expect(r).toBeVisible({ timeout: 15000 });
    await expect(r).toContainText('+4%');
    await expect(r).toContainText('Markup');
    await expect(r).toContainText('All customers');
    await expect(r).toContainText('No end date');

    const wide = setupNumber('wide-a-b');
    await page.goto(`/discounts?erp.search=${wide}`);
    await expect(row(page, wide)).toContainText(/2 customers|\+1 more/, { timeout: 15000 });
    await expect(row(page, wide)).toContainText('-7%');
});

test('the source switch moves between ERP discounts and Requests @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.getByRole('columnheader').first()).toContainText('Discount #', {
        timeout: 15000,
    });
    await expect(page.getByRole('columnheader').nth(1)).toContainText('Valid from');
    await expect(page.getByRole('button', { name: 'New discount grant' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Requests', exact: true }).click();
    await expect(page).toHaveURL(/source=requests/);
    await expect(page.getByRole('columnheader').nth(1)).toContainText('Date', { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'New discount grant' })).toBeVisible();

    await page.getByRole('button', { name: 'ERP discounts', exact: true }).click();
    await expect(page).not.toHaveURL(/source=/);
    await expect(page.getByRole('columnheader').nth(1)).toContainText('Valid from', {
        timeout: 15000,
    });
});

test('on a phone each ERP discount is a card without horizontal scroll @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/discounts?erp.search=${setupNumber('everyone-empty')}`);
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(setupNumber('everyone-empty'), { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});

test('the customer card tab lists that customer setups and the company-wide ones only @on:manager-operator @read-only', async ({
    page,
}) => {
    const name = clientName('a-own');
    await page.goto(`/customers?search=${encodeURIComponent(name)}`);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/.+/);
    await page.getByRole('button', { name: 'Discounts', exact: true }).click();
    await expect(page).toHaveURL(/tab=discounts/);
    await page.getByPlaceholder(SEARCH).fill('91');

    const own = (
        [
            'own-a-running',
            'own-a-inactive',
            'wide-a-b',
            'everyone-no-rows',
            'everyone-empty',
        ] as const
    )
        .map(setupNumber)
        .sort();
    await expect(row(page, own[0])).toBeVisible({ timeout: 15000 });
    await expect(page.locator(ROWS)).toHaveCount(own.length);
    for (const number of own) await expect(row(page, number)).toBeVisible();
    await expect(row(page, setupNumber('own-b-expiring'))).toHaveCount(0);
    await expect(row(page, setupNumber('own-b-expired'))).toHaveCount(0);
    await expect(row(page, setupNumber('everyone-no-rows'))).toContainText('All customers');
    await expect(row(page, setupNumber('own-a-running')).getByRole('link', { name })).toBeVisible();
});
