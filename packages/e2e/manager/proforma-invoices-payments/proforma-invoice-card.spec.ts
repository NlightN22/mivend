import { test, expect } from '@playwright/test';
import { adminTokenFor } from '../../helpers/api-tokens';
import { adminGql } from '../../helpers/api';

async function firstVisibleProformaId(): Promise<string> {
    const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');
    const result = await adminGql<{ visibleProformaInvoices: { items: { id: string }[] } }>(
        `query { visibleProformaInvoices(options: { take: 1, status: "current" }) { items { id } } }`,
        undefined,
        token,
    );
    const id = result.data.visibleProformaInvoices.items[0]?.id;
    if (!id) throw new Error('No visible current proforma invoice in the seed');
    return id;
}

test('the proforma invoice card shows the header, lines, totals and the two print form buttons @on:manager-operator @read-only', async ({
    page,
}) => {
    const id = await firstVisibleProformaId();
    await page.goto(`/proforma-invoices/${id}`);

    await expect(page.getByTestId('proforma-card-header')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('proforma-version')).toBeVisible();
    await expect(page.getByTestId('proforma-status')).toHaveText('Current');
    await expect(page.getByTestId('doc-total-total')).toBeVisible();
    await expect(page.locator('.doc-row').first()).toBeVisible();
    // View-only document: no selection column and no edit or remove controls.
    await expect(page.locator('.doc-row input[type="checkbox"]')).toHaveCount(0);
    await expect(page.locator('.doc-row__actions')).toHaveCount(0);

    const open = page.getByTestId('proforma-open-pdf');
    const download = page.getByTestId('proforma-download-pdf');
    if (await open.count()) {
        await expect(open).toHaveAttribute('target', '_blank');
        await expect(open).not.toHaveAttribute('href', /download=1/);
        await expect(download).toHaveAttribute('href', /\?download=1$/);
    }
});

test('the card opens from the order proforma modal and links back to the order @on:manager-operator @read-only', async ({
    page,
}) => {
    const id = await firstVisibleProformaId();
    await page.goto(`/proforma-invoices/${id}`);
    const link = page.getByTestId('proforma-order-link');
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await expect(page).toHaveURL(/\/orders\/\d+/);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /proforma invoices/i }).click();
    await page.getByTestId('proforma-card-link').first().click();
    await expect(page).toHaveURL(/\/proforma-invoices\/\d+/);
    await expect(page.getByTestId('proforma-card-header')).toBeVisible();
});

test('an unknown proforma invoice id shows the not found state @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/proforma-invoices/999999999');
    await expect(page.getByRole('heading', { name: 'Proforma invoice not found' })).toBeVisible({
        timeout: 15000,
    });
});
