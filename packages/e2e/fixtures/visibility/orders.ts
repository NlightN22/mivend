import { adminGql, shopGql, shopLoginCookie } from '../../helpers/api';
import type { VisIds } from './ids';
import {
    CUSTOMERS,
    PRODUCT,
    VIS_PASSWORD,
    customerEmail,
    type ClientKey,
    type CustomerKey,
} from './plan';

type Shop = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

interface Result {
    __typename: string;
    message?: string;
}

function ok(step: string, result: Result): void {
    if (result.__typename !== 'Order')
        throw new Error(`${step}: ${result.__typename} ${result.message ?? ''}`);
}

// The storefront checkout: pick the point, add a line, choose pickup, pay on terms.
async function placeOrder(shop: Shop, variantId: string, pointId: string): Promise<void> {
    await shop(`mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`, {
        id: pointId,
    });
    await shop(`mutation { removeAllOrderLines { __typename } }`);
    const added = await shop<{ addItemToOrder: Result }>(
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) {
            __typename ... on ErrorResult { message } } }`,
        { id: variantId },
    );
    ok('addItemToOrder', added.addItemToOrder);
    const methods = await shop<{ eligibleShippingMethods: { id: string; code: string }[] }>(
        `{ eligibleShippingMethods { id code } }`,
    );
    const pickup = methods.eligibleShippingMethods.find(m => m.code === 'pickup');
    if (!pickup) throw new Error('No pickup shipping method');
    const shipping = await shop<{ setOrderShippingMethod: Result }>(
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) {
            __typename ... on ErrorResult { message } } }`,
        { id: [pickup.id] },
    );
    ok('setOrderShippingMethod', shipping.setOrderShippingMethod);
    const arranged = await shop<{ transitionOrderToState: Result }>(
        `mutation { transitionOrderToState(state: "ArrangingPayment") {
            __typename ... on ErrorResult { message } } }`,
    );
    ok('transitionOrderToState', arranged.transitionOrderToState);
    const paid = await shop<{ addPaymentToOrder: Result }>(
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) {
            __typename ... on ErrorResult { message } } }`,
    );
    ok('addPaymentToOrder', paid.addPaymentToOrder);
}

interface Proforma {
    id: string;
    status: string;
}

// One placed order per customer with one paid proforma, reused while it is fresh.
export async function ensureOrders(superadmin: string, ids: VisIds): Promise<void> {
    const variants = await adminGql<{ productVariants: { items: { id: string }[] } }>(
        `query($s: String!) { productVariants(options: { filter: { sku: { eq: $s } } }) { items { id } } }`,
        { s: PRODUCT.sku },
        superadmin,
    );
    const variantId = variants.data.productVariants.items[0]?.id;
    if (!variantId) throw new Error(`Variant ${PRODUCT.sku} was not imported`);
    for (const customer of CUSTOMERS) {
        const cookie = await shopLoginCookie(customerEmail(customer.key), VIS_PASSWORD);
        const shop: Shop = (query, variables) => shopGql(query, variables, cookie);
        let code = await freshOrder(superadmin, ids, customer.key);
        if (!code) {
            await placeOrder(shop, variantId, ids.points[customer.client]);
            code = await freshOrder(superadmin, ids, customer.key);
            if (!code) throw new Error(`No placed order for ${customer.key}`);
        }
        const proformas = await shop<{ requestProformaInvoices: Proforma[] }>(
            `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id status } }`,
            { c: code },
        );
        for (const p of proformas.requestProformaInvoices.filter(x => x.status === 'issued'))
            await shop(
                `mutation($id: ID!) { payProformaInvoice(proformaInvoiceId: $id, status: "success") { id } }`,
                { id: p.id },
            );
    }
}

// The manager orders list shows the last 7 days only, so an order older than 3 days is cancelled and replaced.
const FRESH_MS = 3 * 24 * 3600 * 1000;

async function freshOrder(
    superadmin: string,
    ids: VisIds,
    key: CustomerKey,
): Promise<string | undefined> {
    const { data } = await adminGql<{
        customer: {
            orders: {
                items: {
                    id: string;
                    code: string;
                    active: boolean;
                    orderPlacedAt: string | null;
                }[];
            };
        };
    }>(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 50,
            filter: { state: { notEq: "Cancelled" }, active: { eq: false } } }) {
            items { id code active orderPlacedAt } } } }`,
        { id: ids.customers[key] },
        superadmin,
    );
    const placed = data.customer.orders.items.filter(o => !o.active);
    const fresh = placed.find(
        o => o.orderPlacedAt && Date.now() - Date.parse(o.orderPlacedAt) < FRESH_MS,
    );
    if (fresh) return fresh.code;
    for (const order of placed) {
        await refundOrder(superadmin, ids.clients[clientOf(key)], order.id);
        await cancelOrder(superadmin, order.id);
    }
    return undefined;
}

const clientOf = (key: CustomerKey): ClientKey => CUSTOMERS.find(c => c.key === key)!.client;

// A replaced order must not leave a captured demo payment behind: refund it in full first.
async function refundOrder(superadmin: string, clientId: string, orderId: string): Promise<void> {
    const call = <T>(query: string, variables: Record<string, unknown>): Promise<T> =>
        adminGql<T>(query, variables, superadmin).then(r => r.data);
    const proformas = await call<{ proformaInvoicesForOrder: { id: string }[] }>(
        `query($o: ID!) { proformaInvoicesForOrder(orderId: $o) { id } }`,
        { o: orderId },
    );
    const ofOrder = new Set(proformas.proformaInvoicesForOrder.map(p => p.id));
    const payments = await call<{
        visiblePayments: {
            items: {
                id: string;
                amount: number;
                paymentStatus: string;
                proformaInvoiceId: string | null;
            }[];
        };
    }>(
        `query($c: ID!) { visiblePayments(counterpartyId: $c, options: { take: 100 }) {
            items { id amount paymentStatus proformaInvoiceId } } }`,
        { c: clientId },
    );
    for (const p of payments.visiblePayments.items) {
        if (p.paymentStatus !== 'captured' || !ofOrder.has(p.proformaInvoiceId ?? '')) continue;
        await call(
            `mutation($p: ID!, $a: Int!, $r: String!) { recordPaymentRefund(paymentId: $p, amount: $a,
                reason: "e2e visibility seed order replaced", providerRefundId: $r) { id } }`,
            { p: p.id, a: p.amount, r: `e2e-vis-refund-${p.id}` },
        );
    }
}

async function cancelOrder(superadmin: string, orderId: string): Promise<void> {
    const { data } = await adminGql<{ cancelOrder: Result }>(
        `mutation($id: ID!) { cancelOrder(input: { orderId: $id }) {
            __typename ... on ErrorResult { message } } }`,
        { id: orderId },
        superadmin,
    );
    ok('cancelOrder', data.cancelOrder);
    const left = await adminGql<{ orderReservations: { status: string }[] }>(
        `query($o: ID!) { orderReservations(orderId: $o) { status } }`,
        { o: orderId },
        superadmin,
    );
    if (left.data.orderReservations.some(r => r.status === 'active'))
        throw new Error(`Cancelled order ${orderId} kept an active reservation`);
}
