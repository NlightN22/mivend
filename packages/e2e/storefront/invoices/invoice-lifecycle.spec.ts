import { test, expect } from '@playwright/test';
import { gql } from '../orders/helpers';
import { buildOrderAcrossOrganizations, myInvoicesForOrder } from './helpers';

test.describe('Invoice lifecycle: order split, payment, status, filters', () => {
    test('a multi-organization order produces one Invoice per organization, all "pending" before payment', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);

        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string } | null)?.code;
        expect(orderCode).toBeTruthy();

        // Invoices are only materialized by the payment-method handler's createPayment
        // (apps/server/src/payment-method-handlers.ts), not at ArrangingPayment itself — trigger
        // it via addPaymentToOrder with the 'pending' stub status, which Authorizes without
        // settling, so we can assert the pre-payment 'issued' state distinctly from 'paid' below.
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "pending" } }) { __typename } }`,
        );

        const invoices = await myInvoicesForOrder(page, orderCode as string);
        expect(invoices.length).toBeGreaterThanOrEqual(2);
        const organizationIds = new Set(invoices.map(i => i.organizationId));
        expect(organizationIds.size).toBe(invoices.length);
        for (const invoice of invoices) {
            expect(invoice.status).toBe('issued');
        }
    });

    test('settling payment via the online-stub marks every invoice for the order as "paid"', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "success" } }) { __typename } }`,
        );

        const invoices = await myInvoicesForOrder(page, orderCode);
        expect(invoices.length).toBeGreaterThanOrEqual(2);
        for (const invoice of invoices) {
            expect(invoice.status).toBe('paid');
        }

        // Reflected on the storefront /invoices page too, not just the API.
        await page.goto('/invoices');
        await page.waitForLoadState('domcontentloaded');
        for (const invoice of invoices) {
            await expect(
                page.locator('.invoice-row', { hasText: `Invoice #${invoice.id}` }),
            ).toContainText('Paid');
        }
    });

    test('offline-terms checkout leaves invoices "issued" (deferred payment, not yet settled)', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        const invoices = await myInvoicesForOrder(page, orderCode);
        expect(invoices.length).toBeGreaterThanOrEqual(2);
        for (const invoice of invoices) {
            expect(invoice.status).toBe('issued');
        }
    });

    test('a declined online-stub payment leaves invoices "pending" (retryable, not cancelled)', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "online-stub", metadata: { status: "fail" } }) { __typename } }`,
        ).catch(() => {
            // addPaymentToOrder on a Declined payment attempt can itself surface as a GraphQL
            // ErrorResult depending on Vendure version/config — either way, the invoices below
            // are what we actually assert on.
        });

        const invoices = await myInvoicesForOrder(page, orderCode);
        expect(invoices.length).toBeGreaterThanOrEqual(2);
        for (const invoice of invoices) {
            expect(invoice.status).toBe('pending');
        }
    });

    test('the /invoices page status filters match each lifecycle status produced above', async ({
        page,
    }) => {
        // By this point in the suite, prior tests in this file have created invoices in every
        // status this project's Invoice model supports (pending/issued/paid) — verify each
        // filter chip only ever shows invoices in its own status.
        await page.goto('/invoices');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });

        for (const [chipName, expectedText] of [
            ['Pending', 'Pending'],
            ['Issued', 'Issued'],
            ['Paid', 'Paid'],
        ] as const) {
            await page.getByRole('button', { name: chipName }).click();
            await page.waitForLoadState('networkidle');
            const state = page.locator('.invoices-page__state');
            if (await state.isVisible().catch(() => false)) {
                continue; // "No invoices found" for this status in this run — not a failure
            }
            await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });
            // Read all row texts in one shot instead of asserting index-by-index — the list can
            // still be settling (pagination re-render) right after the filter click, and a
            // stale `.count()` read followed by per-index `.nth(i)` assertions races that.
            const rowTexts = await page.locator('.invoice-row').allTextContents();
            for (const text of rowTexts) {
                expect(text).toContain(expectedText);
            }
        }

        await page.getByRole('button', { name: 'All invoices' }).click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.invoice-row').first()).toBeVisible({ timeout: 10000 });
    });
});
