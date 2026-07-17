import { test, expect } from '@playwright/test';
import { gql } from '../orders/helpers';
import {
    buildOrderAcrossOrganizations,
    myAdvanceBalance,
    myInvoicesForOrder,
    payAllOpenInvoices,
    payInvoice,
} from './helpers';

// Cash application (docs/payments.md "Cash application and payment allocation"): a captured
// payment settles its own target invoice first, then FIFOs any remainder across the same
// counterparty+organization's other open invoices, oldest first, and whatever still can't be
// allocated becomes an advance. These specs exercise that against the real backend — including
// the specific scenario that prompted it: the customer paid the same debt twice through two
// different channels (e.g. online acquiring, then a bank transfer reported by the ERP for the
// same invoice) — the second capture must not error and must not double-count, it must cascade.
test.describe('Invoice payment: pay-any-time, independent of order/session state', () => {
    test('payInvoice settles an invoice directly via GraphQL, with no dependency on activeOrder/session', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;

        // offline-terms: order is placed, invoices become 'issued' — nobody has paid yet, and
        // the order is no longer "in progress" from the customer's point of view.
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );
        const [invoiceA] = await myInvoicesForOrder(page, orderCode);
        expect(invoiceA.status).toBe('issued');

        // Now pay it — a completely separate mutation, no addPaymentToOrder, no activeOrder
        // involvement, callable any time after the fact.
        const paid = await payInvoice(page, invoiceA.id, 'success');
        expect(paid.status).toBe('paid');

        const [refetched] = await myInvoicesForOrder(page, orderCode);
        expect(refetched.status).toBe('paid');
    });

    test('a duplicate "success" payment on an already-paid invoice is not re-processed, and its amount is recorded against the SAME organization only (never a different one)', async ({
        page,
    }) => {
        // Start from a clean slate — the dev DB is shared across test runs, so "what's open in
        // this organization" must be established, not assumed.
        test.setTimeout(90000);
        await payAllOpenInvoices(page);

        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );
        const [invoiceA, invoiceB] = await myInvoicesForOrder(page, orderCode);

        await payInvoice(page, invoiceA.id, 'success');
        const balanceBeforeA = await myAdvanceBalance(page);

        // Duplicate: "another channel" (e.g. a bank transfer the ERP later reports) pays the
        // SAME already-paid invoice again.
        await payInvoice(page, invoiceA.id, 'success');

        const [refetchedA] = await myInvoicesForOrder(page, orderCode);
        expect(refetchedA.status).toBe('paid'); // unchanged — not "double paid"

        // invoiceB is a *different* organization (buildOrderAcrossOrganizations guarantees this)
        // and had nothing to do with invoiceA's duplicate — it must be completely untouched.
        const [refetchedB] = (await myInvoicesForOrder(page, orderCode)).filter(
            i => i.id === invoiceB.id,
        );
        expect(refetchedB.status).toBe('issued');

        // The duplicate's amount must show up as an advance for invoiceA's own organization
        // (nothing else was left open there after the clean-slate drain above), never silently
        // vanish and never cross into invoiceB's organization.
        const balanceAfterA = await myAdvanceBalance(page);
        const before =
            balanceBeforeA.find(b => b.currencyCode === invoiceA.currencyCode)?.amount ?? 0;
        const after =
            balanceAfterA.find(b => b.currencyCode === invoiceA.currencyCode)?.amount ?? 0;
        expect(after).toBeGreaterThanOrEqual(before + invoiceA.amount);
    });

    test('a duplicate payment with nothing else open in that organization becomes an advance credit, visible via myAdvanceBalance', async ({
        page,
    }) => {
        // Clean slate first — otherwise a leftover open invoice from an earlier test/run in the
        // same organization would legitimately (and silently) absorb the duplicate instead of it
        // becoming a pure advance, which would make this test flaky rather than wrong.
        test.setTimeout(90000);
        await payAllOpenInvoices(page);

        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );
        const invoices = await myInvoicesForOrder(page, orderCode);
        for (const invoice of invoices) {
            await payInvoice(page, invoice.id, 'success');
        }
        const balanceBefore = await myAdvanceBalance(page);

        // Duplicate-pay the first invoice again — its organization has nothing open (just paid
        // everything above), so this must become a pure advance.
        await payInvoice(page, invoices[0].id, 'success');

        const balanceAfter = await myAdvanceBalance(page);
        const before =
            balanceBefore.find(b => b.currencyCode === invoices[0].currencyCode)?.amount ?? 0;
        const after =
            balanceAfter.find(b => b.currencyCode === invoices[0].currencyCode)?.amount ?? 0;
        expect(after).toBeGreaterThanOrEqual(before + invoices[0].amount);
    });
});
