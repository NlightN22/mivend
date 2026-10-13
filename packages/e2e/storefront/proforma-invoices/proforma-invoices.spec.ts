import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import { buildOrderAcrossOrganizations } from './helpers';

async function goToProformaInvoices(page: Page): Promise<void> {
    await page.goto('/proforma-invoices');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Proforma invoices' })).toBeVisible({
        timeout: 20000,
    });
}

test.describe('Proforma invoices page', () => {
    test('proforma invoices page loads and shows rows', async ({ page }) => {
        await goToProformaInvoices(page);
        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('proforma invoices page shows status filter chips', async ({ page }) => {
        await goToProformaInvoices(page);
        await expect(page.getByRole('button', { name: 'All proforma invoices' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Current' })).toBeVisible();
    });

    test('status filter chip narrows the list to matching proforma invoices only', async ({
        page,
    }) => {
        // Guarantee at least one 'current' proforma invoice exists for this test, rather than assuming
        // ambient DB state left by other tests — a declined online-stub payment is the one
        // reliable way to produce 'pending' (see proforma-invoice-lifecycle.spec.ts).
        await buildOrderAcrossOrganizations(page);
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "fail" } }) { __typename } }`,
        ).catch(() => {
            // may itself surface as a GraphQL ErrorResult depending on Vendure config — the
            // proforma invoices' resulting status is what this test actually checks.
        });

        await goToProformaInvoices(page);
        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });

        const pendingChip = page.getByRole('button', { name: 'Current' });
        await pendingChip.click();
        await page.waitForLoadState('networkidle');

        const rows = page.locator('.proforma-invoice-row');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i)).toContainText('Current');
        }
    });

    test('Open button navigates to proforma invoice detail page with no console errors', async ({
        page,
    }) => {
        await goToProformaInvoices(page);
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });
        await page
            .locator('.proforma-invoice-row')
            .first()
            .getByRole('button', { name: 'Open' })
            .click();

        await expect(page).toHaveURL(/\/proforma-invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        await expect(page.locator('.id-title')).toBeVisible({ timeout: 10000 });
        expect(pageErrors).toEqual([]);
    });
});

test.describe('Proforma invoice detail page', () => {
    let proformaInvoiceId: string;

    test.beforeAll(async ({ browser }) => {
        const ctx = await browser.newContext({
            storageState: '.auth/storefront-user.json',
        });
        const page = await ctx.newPage();
        await goToProformaInvoices(page);
        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });
        await page
            .locator('.proforma-invoice-row')
            .first()
            .getByRole('button', { name: 'Open' })
            .click();
        await page.waitForURL(/\/proforma-invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        proformaInvoiceId = page.url().split('/proforma-invoices/')[1];
        await ctx.close();
    });

    test('detail page shows the proforma invoice title and status', async ({ page }) => {
        await page.goto(`/proforma-invoices/${proformaInvoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-title')).toBeVisible({ timeout: 10000 });
        const title = await page.locator('.id-title').textContent();
        expect(title).toMatch(/ProformaInvoice\s+#\d+/);
    });

    test('detail page shows proforma invoice line items', async ({ page }) => {
        await page.goto(`/proforma-invoices/${proformaInvoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('detail page shows the linked order and its own Open order link', async ({ page }) => {
        await page.goto(`/proforma-invoices/${proformaInvoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-linked-order')).toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('.id-linked-order').getByRole('link', { name: 'Open order' }),
        ).toBeVisible();
    });

    test('Pay proforma invoice button opens the pay flow and settles the proforma invoice end-to-end', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        await page.goto('/proforma-invoices');
        await page.waitForLoadState('domcontentloaded');
        const row = page
            .locator('.proforma-invoice-row', { hasText: `Order ${orderCode}` })
            .first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.getByRole('button', { name: 'Open' }).click();
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByRole('link', { name: 'Pay proforma invoice' })).toBeVisible();
        await page.getByRole('link', { name: 'Pay proforma invoice' }).click();
        await expect(page).toHaveURL(/\/proforma-invoices\/[a-zA-Z0-9]+\/pay$/, { timeout: 10000 });

        await page.getByRole('button', { name: /Payment successful/ }).click();
        await expect(page).toHaveURL(/\/proforma-invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        await expect(page.locator('.id-pay-note')).toContainText('fully paid');
        await expect(page.getByRole('button', { name: 'Pay proforma invoice' })).toBeDisabled();
    });

    test('back link returns to proforma invoices list', async ({ page }) => {
        await page.goto(`/proforma-invoices/${proformaInvoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.id-back').click();
        await expect(page).toHaveURL(/\/proforma-invoices$/, { timeout: 10000 });
    });
});
