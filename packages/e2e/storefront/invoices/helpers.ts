import { type Page } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { gql, clearCart } from '../orders/helpers';

const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

interface InStockVariant {
    id: string;
    organizationId: number | null;
}

export interface InvoiceSummary {
    id: string;
    status: string;
    organizationId: string;
    amount: number;
    currencyCode: string;
    order: { code: string };
}

// Picks two in-stock variants whose products were assigned to two *different* organizations
// (global-setup.ts round-robins organizationId across seed fixtures) — this is what actually
// forces InvoiceService.computeSplit to produce more than one Invoice for a single order.
export async function pickTwoVariantsFromDifferentOrganizations(
    page: Page,
): Promise<[string, string]> {
    const searchResult = await gql(
        page,
        `query { search(input: { take: 50, inStock: true, groupByProduct: false }) { items { productVariantId } } }`,
    );
    const candidateIds = (
        searchResult.search as { items: { productVariantId: string }[] }
    ).items.map(i => i.productVariantId);
    if (candidateIds.length < 2) {
        throw new Error('Need at least 2 in-stock variants to test a multi-organization split');
    }

    const { token } = await adminGql<{ login: { __typename: string } }>(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: SUPERADMIN.identifier, p: SUPERADMIN.password },
    );

    const variants: InStockVariant[] = [];
    for (const id of candidateIds) {
        const { data } = await adminGql<{
            productVariant: { id: string; customFields?: { organizationId: number | null } } | null;
        }>(
            `query($id: ID!) { productVariant(id: $id) { id customFields { organizationId } } }`,
            { id },
            token,
        );
        if (data.productVariant) {
            variants.push({
                id: data.productVariant.id,
                organizationId: data.productVariant.customFields?.organizationId ?? null,
            });
        }
    }

    const byOrg = new Map<number, string>();
    for (const v of variants) {
        if (v.organizationId != null && !byOrg.has(v.organizationId)) {
            byOrg.set(v.organizationId, v.id);
        }
    }
    if (byOrg.size < 2) {
        throw new Error(
            `Only found variants from ${byOrg.size} distinct organization(s) among ${variants.length} ` +
                'in-stock candidates — cannot exercise a multi-invoice split. Seed more products/organizations.',
        );
    }
    const [first, second] = [...byOrg.values()];
    return [first, second];
}

export async function buildOrderAcrossOrganizations(page: Page): Promise<[string, string]> {
    await clearCart(page);
    const [variantA, variantB] = await pickTwoVariantsFromDifferentOrganizations(page);

    await gql(
        page,
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
        { id: variantA },
    );
    await gql(
        page,
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
        { id: variantB },
    );

    await gql(
        page,
        `mutation { setOrderShippingAddress(input: {
            fullName: "E2E Invoice Test", streetLine1: "Test Street 1", city: "Test City", countryCode: "RU"
        }) { __typename } }`,
    );

    const methodsData = await gql(page, `query { eligibleShippingMethods { id } }`);
    const methodId = (methodsData.eligibleShippingMethods as { id: string }[])[0].id;
    await gql(
        page,
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
        { id: [methodId] },
    );

    await gql(
        page,
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on Order { code } } }`,
    );

    return [variantA, variantB];
}

export async function myInvoicesForOrder(page: Page, orderCode: string): Promise<InvoiceSummary[]> {
    const result = await gql(
        page,
        `query { myInvoices(options: { take: 50 }) { items { id status organizationId amount currencyCode order { code } } } }`,
    );
    const items = (result.myInvoices as { items: InvoiceSummary[] }).items;
    return items.filter(i => i.order.code === orderCode);
}

export async function payInvoice(
    page: Page,
    invoiceId: string,
    status: 'success' | 'pending' | 'fail' | 'cancel',
    channel?: 'online-acquiring' | 'branch-kassa' | 'bank-transfer-erp',
): Promise<{ id: string; status: string }> {
    const result = await gql(
        page,
        `mutation($invoiceId: ID!, $status: String!, $channel: String) { payInvoice(invoiceId: $invoiceId, status: $status, channel: $channel) { id status } }`,
        { invoiceId, status, channel },
    );
    return result.payInvoice as { id: string; status: string };
}

export async function myAdvanceBalance(
    page: Page,
): Promise<{ amount: number; currencyCode: string }[]> {
    const result = await gql(page, `query { myAdvanceBalance { amount currencyCode } }`);
    return result.myAdvanceBalance as { amount: number; currencyCode: string }[];
}

// The dev database is shared across test runs (no per-test DB reset), so "nothing else open"
// scenarios need a real clean slate rather than an assumption. Pays each invoice against
// *itself* (payInvoice always uses the target invoice's own amount) — this always fully covers
// that invoice with zero remainder, so a single pass over every currently-open invoice reliably
// clears all of them; no partial-coverage/overflow can occur from a self-payment.
export async function payAllOpenInvoices(page: Page): Promise<void> {
    const result = await gql(
        page,
        `query { myInvoices(options: { take: 5000 }) { items { id status } } }`,
    );
    const open = (result.myInvoices as { items: { id: string; status: string }[] }).items.filter(
        inv => inv.status === 'pending' || inv.status === 'issued',
    );
    // Run with bounded concurrency rather than one request at a time — this dev DB accumulates
    // invoices across an entire long-running test session (thousands by now), and a fully
    // sequential drain here was timing out tests that need a genuine clean slate.
    const CONCURRENCY = 10;
    for (let i = 0; i < open.length; i += CONCURRENCY) {
        const batch = open.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(invoice => payInvoice(page, invoice.id, 'success')));
    }
}
