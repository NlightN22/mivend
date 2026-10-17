import { adminTokenFor } from '../../helpers/api-tokens';
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

export interface ProformaInvoiceSummary {
    id: string;
    uuid: string;
    number: string;
    status: string;
    organizationId: string;
    amount: number;
    currencyCode: string;
    order: { code: string };
}

// Variants must belong to different organizations (seed fixtures assign organizationId round-robin)
// so issueForOrder produces more than one ProformaInvoice for a single order.
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

    const token = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);

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
                'in-stock candidates — cannot exercise a multi-proforma-invoice split. Seed more products/organizations.',
        );
    }
    const [first, second] = [...byOrg.values()];
    return [first, second];
}

export async function buildOrderAcrossOrganizations(page: Page): Promise<[string, string]> {
    await clearCart(page);
    const [variantA, variantB] = await pickTwoVariantsFromDifferentOrganizations(page);

    for (const id of [variantA, variantB]) {
        const added = (await gql(
            page,
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename ... on ErrorResult { message } } }`,
            { id },
        )) as { addItemToOrder: { __typename: string; message?: string } };
        if (added.addItemToOrder.__typename !== 'Order') {
            throw new Error(`addItemToOrder(${id}): ${added.addItemToOrder.message}`);
        }
    }

    await gql(
        page,
        `mutation { setOrderShippingAddress(input: {
            fullName: "E2E ProformaInvoice Test", streetLine1: "Test Street 1", city: "Test City", countryCode: "RU"
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

export async function myProformaInvoicesForOrder(
    page: Page,
    orderCode: string,
): Promise<ProformaInvoiceSummary[]> {
    const result = await gql(
        page,
        `query($c: String!) { myProformaInvoices(options: { orderCode: $c, take: 50 }) { items { id uuid number status organizationId amount currencyCode order { code } } } }`,
        { c: orderCode },
    );
    const items = (result.myProformaInvoices as { items: ProformaInvoiceSummary[] }).items;
    return items.filter(i => i.order.code === orderCode);
}

export async function payProformaInvoice(
    page: Page,
    proformaInvoiceId: string,
    status: 'success' | 'pending' | 'fail' | 'cancel',
    channel?: 'online-acquiring' | 'branch-kassa' | 'bank-transfer-erp',
): Promise<{ id: string; status: string }> {
    const result = await gql(
        page,
        `mutation($proformaInvoiceId: ID!, $status: String!, $channel: String) { payProformaInvoice(proformaInvoiceId: $proformaInvoiceId, status: $status, channel: $channel) { id status } }`,
        { proformaInvoiceId, status, channel },
    );
    return result.payProformaInvoice as { id: string; status: string };
}

export async function myAdvanceBalance(
    page: Page,
): Promise<{ amount: number; currencyCode: string }[]> {
    const result = await gql(page, `query { myAdvanceBalance { amount currencyCode } }`);
    return result.myAdvanceBalance as { amount: number; currencyCode: string }[];
}

// The dev DB is shared across test runs with no reset, so open invoices must be cleared explicitly.
// Self-payment fully covers each invoice with zero remainder, so one pass clears all of them.
export async function payAllOpenProformaInvoices(page: Page): Promise<void> {
    const result = await gql(
        page,
        `query { myProformaInvoices(options: { take: 5000 }) { items { id status } } }`,
    );
    const open = (
        result.myProformaInvoices as { items: { id: string; status: string }[] }
    ).items.filter(inv => inv.status === 'pending' || inv.status === 'issued');
    // The dev DB accumulates thousands of proforma invoices across a long test session.
    // A sequential drain timed out, so run with bounded concurrency.
    const CONCURRENCY = 10;
    for (let i = 0; i < open.length; i += CONCURRENCY) {
        const batch = open.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(proformaInvoice => payProformaInvoice(page, proformaInvoice.id, 'success')),
        );
    }
}
