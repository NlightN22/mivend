import { test, expect } from '@playwright/test';
import { adminTokenFor } from '../../helpers/api-tokens';
import { adminGql } from '../../helpers/api';
import { isSorted, readAmounts } from '../../helpers/amount-column';
import { formatDocumentNumber } from '../../helpers/e2e-order';

const ROWS = '.mv-advanced-data-table__grid tbody tr';
const ROW_LINKS = `${ROWS} a[href^="/orders/"]`;
const PROFORMA_LINK = `${ROWS} a[href^="/proforma-invoices/"]`;

async function visibleProformas(
    options: string,
): Promise<{ totalItems: number; items: { id: string; number: string }[] }> {
    const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');
    const result = await adminGql<{
        visibleProformaInvoices: { totalItems: number; items: { id: string; number: string }[] };
    }>(
        `query { visibleProformaInvoices(options: ${options}) { totalItems items { id number } } }`,
        undefined,
        token,
    );
    return result.data.visibleProformaInvoices;
}

test('status chips carry counts and All comes first @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('All', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(page.getByRole('button', { name: /^Current \d+$/ })).toBeVisible();
});

test('a status chip and the search live in the URL and filter on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Current \d+$/ }).click();
    await expect(page).toHaveURL(/view=current/);
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr').first()).toBeVisible();
    await expect(
        page
            .locator('.mv-advanced-data-table__grid tbody')
            .getByText('Superseded', { exact: true }),
    ).toHaveCount(0);
});

// The order card's "Proforma invoices" modal links here with the order code.
test('search from an order code link lists only that order proforma invoices @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const orderLink = page.locator(ROW_LINKS).first();
    await expect(orderLink).toBeVisible({ timeout: 15000 });
    const href = (await orderLink.getAttribute('href')) ?? '';
    const code = href.split('/').pop() ?? '';
    expect(code).not.toBe('');

    await page.goto(`/proforma-invoices?search=${code}`);
    const links = page.locator(ROW_LINKS);
    await expect(links.first()).toBeVisible({ timeout: 15000 });
    for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', `/orders/${code}`);
    }
});

test('the Filter builder and a sortable header narrow and order the list on the server @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices?sortField=amount&sortDir=ASC');
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await page
        .getByRole('button', { name: /Filter/ })
        .first()
        .click();
    await page.getByText('Amount', { exact: true }).last().click();
    await page.locator('select').last().selectOption({ label: 'is greater than' });
    await page.getByPlaceholder('Value').fill('0');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page).toHaveURL(/filters=amount/);
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => isSorted(await readAmounts(page), 'ASC')).toBe(true);
    const ascAmounts = await readAmounts(page);
    await page
        .getByRole('columnheader', { name: /Amount/ })
        .getByRole('button')
        .click();
    // Descending is the default direction, so the URL drops sortDir once the click flips ASC to DESC.
    await expect(page).not.toHaveURL(/sortDir=ASC/);
    await expect(page).toHaveURL(/sortField=amount/);
    await expect.poll(async () => isSorted(await readAmounts(page), 'DESC')).toBe(true);
    const descAmounts = await readAmounts(page);
    if (new Set(ascAmounts).size > 1) expect(descAmounts[0]).toBeGreaterThan(ascAmounts[0]);
});

test('the list shows its columns and the chip counts match the server totals @on:manager-operator @read-only', async ({
    page,
}) => {
    const all = await visibleProformas('{ take: 1 }');
    const current = await visibleProformas('{ take: 1, status: "current" }');
    expect(all.totalItems).toBeGreaterThan(0);
    await page.goto('/proforma-invoices');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Proforma invoices' })).toBeVisible({
        timeout: 15000,
    });
    for (const header of ['Proforma invoice #', 'Date', 'Customer', 'Order', 'Status', 'Amount']) {
        await expect(main.getByRole('columnheader', { name: header })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^All \d+$/ })).toHaveText(
        new RegExp(`^All\\s*${all.totalItems}$`),
    );
    await expect(page.getByRole('button', { name: /^Current \d+$/ })).toHaveText(
        new RegExp(`^Current\\s*${current.totalItems}$`),
    );
    await expect(page.locator(ROWS).first()).toBeVisible();
});

test('searching a proforma number lists that proforma invoice with its card link @on:manager-operator @read-only', async ({
    page,
}) => {
    const { items } = await visibleProformas('{ take: 1 }');
    const target = items[0];
    await page.goto(`/proforma-invoices?search=${target.number}`);
    const link = page.locator(PROFORMA_LINK).first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveText(formatDocumentNumber(target.number));
    await expect(link).toHaveAttribute('href', `/proforma-invoices/${target.id}`);
});

test('a click on a row or on its number opens the proforma card, not the order @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const first = page.locator(ROWS).first();
    await expect(first.locator('a[href^="/proforma-invoices/"]')).toBeVisible({ timeout: 15000 });
    await first.locator('td').first().click();
    await expect(page).toHaveURL(/\/proforma-invoices\/[^/?]+$/);
    await expect(page.getByTestId('proforma-card-header')).toBeVisible({ timeout: 15000 });

    await page.goto('/proforma-invoices');
    await expect(page.locator(PROFORMA_LINK).first()).toBeVisible({ timeout: 15000 });
    await page.locator(PROFORMA_LINK).first().click();
    await expect(page).toHaveURL(/\/proforma-invoices\/[^/?]+$/);
    await expect(page.getByTestId('proforma-card-header')).toBeVisible({ timeout: 15000 });
});

test('the order cell link opens the order card @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices');
    const link = page.locator(ROW_LINKS).first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await expect(page).toHaveURL(/\/orders\/\d+/);
});

test('the list paginates on the server @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/proforma-invoices');
    const nextButton = page.getByRole('button', { name: 'Next Page' });
    await expect(page.locator(ROW_LINKS).first()).toBeVisible({ timeout: 15000 });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(ROW_LINKS).first()).toBeVisible();
});

test('on a phone each proforma invoice is a card @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/proforma-invoices');
    await expect(page.getByRole('columnheader').first()).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});
