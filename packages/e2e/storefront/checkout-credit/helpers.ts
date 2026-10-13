import { type Page } from '@playwright/test';
import { adminGql, postBatch, waitForRun } from '../../helpers/api';
import { gql, clearCart } from '../orders/helpers';

export const PASSWORD = 'Password123!';
export const CREDIT_BUYER = 'credit-limited@buyer.example';
export const PREPAY_BUYER = 'prepay@buyer.example';
// Above the seeded 100 000 limit at wholesale prices, within the seeded stock.
export const OVER_LIMIT_CART: [string, number][] = [
    ['E2E-OIL-003', 90],
    ['E2E-OIL-001', 80],
    ['E2E-OIL-002', 60],
];

export interface PlacedPayment {
    typename: string;
    code?: string;
    state?: string;
    message?: string;
}

export interface AdminOrder {
    id: string;
    code: string;
    state: string;
    reservationState: string | null;
    payments: {
        id: string;
        method: string;
        state: string;
        amount: number;
        metadata: Record<string, unknown>;
    }[];
}

export interface Preview {
    exceeded: boolean;
    limitControlled: boolean;
    allowExceedingCreditLimit: boolean;
    acknowledgementRequired: boolean;
    payableCardAmount: number;
    orderAmount: number;
    availableForms: string[];
}

export async function loginBuyer(page: Page, email: string): Promise<void> {
    await gql(
        page,
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: email, p: PASSWORD },
    );
    await clearCart(page);
}

export async function addSku(page: Page, sku: string, quantity: number): Promise<void> {
    const found = (await gql(
        page,
        `query($t: String) { search(input: { take: 1, term: $t, inStock: true, groupByProduct: false }) { items { productVariantId sku } } }`,
        { t: sku },
    )) as { search: { items: { productVariantId: string; sku: string }[] } };
    const item = found.search.items.find(i => i.sku === sku);
    if (!item) throw new Error(`No in-stock variant ${sku}`);
    // An InsufficientStockError still adds what is available, which is all the tests need.
    await page.request.post(`${process.env.STOREFRONT_URL ?? 'http://localhost:5173'}/shop-api`, {
        data: {
            query: `mutation($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) { __typename } }`,
            variables: { id: item.productVariantId, q: quantity },
        },
    });
}

export async function fillCartOverLimit(page: Page): Promise<void> {
    for (const [sku, qty] of OVER_LIMIT_CART) await addSku(page, sku, qty);
}

export async function prepareShipping(page: Page): Promise<void> {
    await gql(
        page,
        `mutation { setOrderShippingAddress(input: { fullName: "E2E Checkout", streetLine1: "Test Street 1", city: "Test City", countryCode: "RU" }) { __typename } }`,
    );
    const methods = (await gql(page, `query { eligibleShippingMethods { id } }`)) as {
        eligibleShippingMethods: { id: string }[];
    };
    await gql(
        page,
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
        { id: [methods.eligibleShippingMethods[0].id] },
    );
}

export async function creditPreview(page: Page): Promise<Preview> {
    const data = (await gql(
        page,
        `query { deferredCreditPreview { exceeded limitControlled allowExceedingCreditLimit acknowledgementRequired payableCardAmount orderAmount availableForms } }`,
    )) as { deferredCreditPreview: Preview };
    return data.deferredCreditPreview;
}

export async function placeViaApi(
    page: Page,
    method: string,
    metadata: Record<string, unknown> = {},
): Promise<PlacedPayment> {
    await prepareShipping(page);
    await gql(
        page,
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
    );
    const data = (await gql(
        page,
        `mutation($m: String!, $md: JSON!) { addPaymentToOrder(input: { method: $m, metadata: $md }) {
            __typename ... on Order { code state }
            ... on ErrorResult { message }
            ... on PaymentFailedError { paymentErrorMessage }
            ... on PaymentDeclinedError { paymentErrorMessage }
        } }`,
        { m: method, md: metadata },
    )) as { addPaymentToOrder: Record<string, string> };
    const r = addPaymentToOrderResult(data.addPaymentToOrder);
    return r;
}

function addPaymentToOrderResult(r: Record<string, string>): PlacedPayment {
    return {
        typename: r.__typename,
        code: r.code,
        state: r.state,
        message: r.paymentErrorMessage ?? r.message,
    };
}

let adminToken: string | undefined;

export async function admin<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!adminToken) {
        const res = await adminGql<unknown>(
            `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
            {
                u: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
                p: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
            },
        );
        adminToken = res.token;
    }
    return (await adminGql<T>(query, variables, adminToken)).data;
}

export async function adminOrder(code: string): Promise<AdminOrder> {
    const data = await admin<{
        orders: {
            items: {
                id: string;
                code: string;
                state: string;
                customFields: { reservationState: string | null };
                payments: AdminOrder['payments'];
            }[];
        };
    }>(
        `query($c: String!) { orders(options: { filter: { code: { eq: $c } } }) { items { id code state customFields { reservationState } payments { id method state amount metadata } } } }`,
        { c: code },
    );
    const o = data.orders.items[0];
    return { ...o, reservationState: o.customFields.reservationState };
}

// Admin cancelOrder leaves the reservation active (no ERP locally), so release it explicitly
// or the shared stock would run out across runs.
export async function cancelOpenOrders(email: string): Promise<void> {
    const customers = await admin<{ customers: { items: { id: string }[] } }>(
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: email },
    );
    const id = customers.customers.items[0]?.id;
    if (!id) return;
    const data = await admin<{
        customer: { orders: { items: { id: string; state: string }[] } };
    }>(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 100, sort: { createdAt: DESC } }) { items { id state } } } }`,
        { id },
    );
    for (const o of data.customer.orders.items) {
        if (o.state === 'AddingItems' || o.state === 'Draft') continue;
        await admin(`mutation($o: ID!) { releaseOrderReservation(orderId: $o) }`, {
            o: o.id,
        }).catch(() => undefined);
        if (o.state === 'Cancelled') continue;
        await admin(`mutation($i: CancelOrderInput!) { cancelOrder(input: $i) { __typename } }`, {
            i: { orderId: o.id },
        });
    }
}

export interface BranchSettingsSnapshot {
    branchId: string;
    defaultPriceTypeId: string;
    defaultWarehouseId: string | null;
    visiblePriceTypeIds: string[] | null;
    visibleWarehouseIds: string[] | null;
    allowExceedingCreditLimit: boolean;
}

export async function defaultBranchSettings(): Promise<BranchSettingsSnapshot> {
    const g = await admin<{ globalSettings: { customFields: { defaultBranchId: string } } }>(
        `query { globalSettings { customFields { defaultBranchId } } }`,
    );
    const branchId = g.globalSettings.customFields.defaultBranchId;
    const s = await admin<{ branchSettings: BranchSettingsSnapshot }>(
        `query($b: String!) { branchSettings(branchId: $b) { branchId defaultPriceTypeId defaultWarehouseId visiblePriceTypeIds visibleWarehouseIds allowExceedingCreditLimit } }`,
        { b: branchId },
    );
    return s.branchSettings;
}

export async function setAllowExceeding(
    base: BranchSettingsSnapshot,
    allow: boolean,
): Promise<void> {
    await admin(
        `mutation($b: String!, $p: String!, $w: String!, $vp: [String!], $vw: [String!], $a: Boolean) {
            setBranchSettings(branchId: $b, defaultPriceTypeId: $p, defaultWarehouseId: $w, visiblePriceTypeIds: $vp, visibleWarehouseIds: $vw, allowExceedingCreditLimit: $a) { branchId }
        }`,
        {
            b: base.branchId,
            p: base.defaultPriceTypeId,
            w: base.defaultWarehouseId ?? '',
            vp: base.visiblePriceTypeIds,
            vw: base.visibleWarehouseIds,
            a: allow,
        },
    );
}

// The reservation state is written by an async subscriber: poll (bounded) until it is the expected one.
export async function orderWithReservation(code: string, expected: string): Promise<AdminOrder> {
    let order = await adminOrder(code);
    for (let i = 0; i < 120 && order.reservationState !== expected; i++) {
        await new Promise(r => setTimeout(r, 500));
        order = await adminOrder(code);
    }
    return order;
}

// ATP counts both Vendure's allocation and the reservation, so a big cart needs more stock
// than the seed gives; stock records go through the ERP import like every other seed.
export async function boostStock(skus: string[], stockOnHand = 1000): Promise<void> {
    const exchangeId = `e2e-checkout-stock-${Date.now()}`;
    await postBatch(
        exchangeId,
        skus.map(sku => ({ type: 'stock', data: { sku, stockOnHand } })),
    );
    await waitForRun(exchangeId);
}
