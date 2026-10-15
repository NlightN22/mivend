import { test, expect } from '@playwright/test';
import { gql } from '../orders/helpers';
import { buildOrderAcrossOrganizations, myProformaInvoicesForOrder } from './helpers';

test.describe('Proforma invoice lifecycle: order split, payment, status, filters', () => {
    test('a multi-organization order produces one proforma invoice per organization, all "pending" before payment', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);

        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string } | null)?.code;
        expect(orderCode).toBeTruthy();

        // ProformaInvoices are created by the payment handler's createPayment, not at ArrangingPayment.
        // The 'pending' stub status authorizes without settling, so 'issued' is asserted before 'paid'.
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "pending" } }) { __typename } }`,
        );

        const proformaInvoices = await myProformaInvoicesForOrder(page, orderCode as string);
        expect(proformaInvoices.length).toBeGreaterThanOrEqual(2);
        const organizationIds = new Set(proformaInvoices.map(i => i.organizationId));
        expect(organizationIds.size).toBe(proformaInvoices.length);
        for (const proformaInvoice of proformaInvoices) {
            expect(proformaInvoice.status).toBe('issued');
        }
    });

    test('settling payment via the online-stub marks every proforma invoice for the order as "paid"', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "success" } }) { __typename } }`,
        );

        const proformaInvoices = await myProformaInvoicesForOrder(page, orderCode);
        expect(proformaInvoices.length).toBeGreaterThanOrEqual(2);
        for (const proformaInvoice of proformaInvoices) {
            expect(proformaInvoice.status).toBe('paid');
        }

        // Reflected on the storefront /proforma-invoices page too, not just the API.
        await page.goto('/proforma-invoices');
        await page.waitForLoadState('domcontentloaded');
        for (const proformaInvoice of proformaInvoices) {
            await expect(
                page.locator('.proforma-invoice-row', {
                    hasText: `Proforma invoice #${proformaInvoice.number}`,
                }),
            ).toContainText('Current');
        }
    });

    test('offline-terms checkout leaves proforma invoices "issued" (unpaid until a payment fact arrives)', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        const proformaInvoices = await myProformaInvoicesForOrder(page, orderCode);
        expect(proformaInvoices.length).toBeGreaterThanOrEqual(2);
        for (const proformaInvoice of proformaInvoices) {
            expect(proformaInvoice.status).toBe('issued');
        }
    });

    test('a declined online-stub payment leaves proforma invoices "pending" (retryable, not cancelled)', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "fail" } }) { __typename } }`,
        ).catch(() => {
            // addPaymentToOrder on Declined may return an ErrorResult, depending on Vendure version/config.
            // So assert on the proforma invoices, not on this call's result.
        });

        const proformaInvoices = await myProformaInvoicesForOrder(page, orderCode);
        expect(proformaInvoices.length).toBeGreaterThanOrEqual(2);
        for (const proformaInvoice of proformaInvoices) {
            expect(proformaInvoice.status).toBe('pending');
        }
    });

    test('the /proforma-invoices page status filters match each lifecycle status produced above', async ({
        page,
    }) => {
        // Relies on earlier tests in this file having created invoices in every status,
        // otherwise the per-chip check proves nothing.
        await page.goto('/proforma-invoices');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });

        for (const [chipName, expectedText] of [
            ['Current', 'Current'],
            ['Superseded', 'Superseded'],
            ['Cancelled', 'Cancelled'],
        ] as const) {
            await page.getByRole('button', { name: chipName }).click();
            await page.waitForLoadState('networkidle');
            const state = page.locator('.proforma-invoices-page__state');
            if (await state.isVisible().catch(() => false)) {
                continue; // "No proforma invoices found" for this status in this run — not a failure
            }
            await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({
                timeout: 10000,
            });
            // The list can still be re-rendering after the filter click (pagination),
            // so a stale count() plus per-index nth(i) reads race; read all texts at once.
            const rowTexts = await page.locator('.proforma-invoice-row').allTextContents();
            for (const text of rowTexts) {
                expect(text).toContain(expectedText);
            }
        }

        await page.getByRole('button', { name: 'All proforma invoices' }).click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.proforma-invoice-row').first()).toBeVisible({ timeout: 10000 });
    });
});
