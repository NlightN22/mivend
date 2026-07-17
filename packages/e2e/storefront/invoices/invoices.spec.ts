import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import { buildOrderAcrossOrganizations } from './helpers';

async function goToInvoices(page: Page): Promise<void> {
    await page.goto('/invoices');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible({ timeout: 20000 });
}

test.describe('Invoices page', () => {
    test('invoices page loads and shows rows', async ({ page }) => {
        await goToInvoices(page);
        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('invoices page shows status filter chips', async ({ page }) => {
        await goToInvoices(page);
        await expect(page.getByRole('button', { name: 'All invoices' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pending' })).toBeVisible();
    });

    test('status filter chip narrows the list to matching invoices only', async ({ page }) => {
        // Guarantee at least one 'pending' invoice exists for this test, rather than assuming
        // ambient DB state left by other tests — a declined online-stub payment is the one
        // reliable way to produce 'pending' (see invoice-lifecycle.spec.ts).
        await buildOrderAcrossOrganizations(page);
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "fail" } }) { __typename } }`,
        ).catch(() => {
            // may itself surface as a GraphQL ErrorResult depending on Vendure config — the
            // invoices' resulting status is what this test actually checks.
        });

        await goToInvoices(page);
        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });

        const pendingChip = page.getByRole('button', { name: 'Pending' });
        await pendingChip.click();
        await page.waitForLoadState('networkidle');

        const rows = page.locator('.invoice-row');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i)).toContainText('Pending');
        }
    });

    test('Open button navigates to invoice detail page with no console errors', async ({
        page,
    }) => {
        await goToInvoices(page);
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.invoice-row').first().getByRole('button', { name: 'Open' }).click();

        await expect(page).toHaveURL(/\/invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        await expect(page.locator('.id-title')).toBeVisible({ timeout: 10000 });
        expect(pageErrors).toEqual([]);
    });
});

test.describe('Invoice detail page', () => {
    let invoiceId: string;

    test.beforeAll(async ({ browser }) => {
        const ctx = await browser.newContext({
            storageState: '.auth/storefront-user.json',
        });
        const page = await ctx.newPage();
        await goToInvoices(page);
        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.invoice-row').first().getByRole('button', { name: 'Open' }).click();
        await page.waitForURL(/\/invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        invoiceId = page.url().split('/invoices/')[1];
        await ctx.close();
    });

    test('detail page shows the invoice title and status', async ({ page }) => {
        await page.goto(`/invoices/${invoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-title')).toBeVisible({ timeout: 10000 });
        const title = await page.locator('.id-title').textContent();
        expect(title).toMatch(/Invoice\s+#\d+/);
    });

    test('detail page shows invoice line items', async ({ page }) => {
        await page.goto(`/invoices/${invoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('detail page shows the linked order and its own Open order link', async ({ page }) => {
        await page.goto(`/invoices/${invoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.id-linked-order')).toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('.id-linked-order').getByRole('link', { name: 'Open order' }),
        ).toBeVisible();
    });

    test('Pay invoice button opens the pay flow and settles the invoice end-to-end', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        await page.goto('/invoices');
        await page.waitForLoadState('domcontentloaded');
        const row = page.locator('.invoice-row', { hasText: `Order ${orderCode}` }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.getByRole('button', { name: 'Open' }).click();
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByRole('link', { name: 'Pay invoice' })).toBeVisible();
        await page.getByRole('link', { name: 'Pay invoice' }).click();
        await expect(page).toHaveURL(/\/invoices\/[a-zA-Z0-9]+\/pay$/, { timeout: 10000 });

        await page.getByRole('button', { name: /Payment successful/ }).click();
        await expect(page).toHaveURL(/\/invoices\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        await expect(page.locator('.id-pay-note')).toContainText('fully paid');
        await expect(page.getByRole('button', { name: 'Pay invoice' })).toBeDisabled();
    });

    test('back link returns to invoices list', async ({ page }) => {
        await page.goto(`/invoices/${invoiceId}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.id-back').click();
        await expect(page).toHaveURL(/\/invoices$/, { timeout: 10000 });
    });
});
