import { gqlOk, login } from '../harness/graphql';
import type { ImportTarget } from './erp-import-seed';
import {
    CUSTOMER_PASSWORD,
    ORDERS,
    orderCustomerEmail,
    type OrderCustomerKey,
    type OrderKey,
    type OrderPlan,
    type PaymentKey,
} from './fixture-plan';
import { seedCatalog } from './orders-catalog-seed';

export interface SeedProforma {
    id: string;
    number: string;
}

export interface SeedPayment {
    id: string;
    proforma: SeedProforma;
    refundMarker: string;
}

export interface OrderSeedIds {
    orders: Record<OrderKey, { id: string; code: string; pointId: string }>;
    aOwnProformas: { issued: SeedProforma; cancelled: SeedProforma };
    payments: Record<PaymentKey, SeedPayment>;
}

type Shop = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

interface Result {
    __typename: string;
    message?: string;
}

function ok(step: string, result: Result): void {
    if (result.__typename === 'Order') return;
    throw new Error(`${step}: ${result.__typename} ${result.message ?? ''}`);
}

// The storefront checkout: pick the point, add a line, choose delivery, pay by bank transfer.
async function placeOrder(
    shop: Shop,
    variantId: string,
    pointId: string,
): Promise<{ id: string; code: string }> {
    await shop(`mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`, {
        id: pointId,
    });
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
    const paid = await shop<{ addPaymentToOrder: Result & { id?: string; code?: string } }>(
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) {
            __typename ... on ErrorResult { message } ... on Order { id code } } }`,
    );
    ok('addPaymentToOrder', paid.addPaymentToOrder);
    return { id: paid.addPaymentToOrder.id!, code: paid.addPaymentToOrder.code! };
}

interface Proforma extends SeedProforma {
    status: string;
}

const REQUEST = `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id number status } }`;

async function issued(shop: Shop, code: string): Promise<Proforma> {
    const list = await shop<{ requestProformaInvoices: Proforma[] }>(REQUEST, { c: code });
    const found = list.requestProformaInvoices.find(p => p.status === 'issued');
    if (!found) throw new Error(`Order ${code} got no issued proforma`);
    return found;
}

const pick = ({ id, number }: Proforma): SeedProforma => ({ id, number });

export async function seedOrders(
    target: ImportTarget,
    superadmin: string,
    points: Record<OrderPlan['counterparty'], string>,
): Promise<OrderSeedIds> {
    const admin = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        gqlOk<T>(target.baseUrl, 'admin-api', query, variables, superadmin);
    const variantId = await seedCatalog(target, superadmin);
    const sessions = new Map<OrderCustomerKey, Shop>();
    const shopOf = async (key: OrderCustomerKey): Promise<Shop> => {
        const known = sessions.get(key);
        if (known) return known;
        const token = await login(
            target.baseUrl,
            'shop-api',
            orderCustomerEmail(key),
            CUSTOMER_PASSWORD,
        );
        const shop: Shop = (query, variables) =>
            gqlOk(target.baseUrl, 'shop-api', query, variables, token);
        sessions.set(key, shop);
        return shop;
    };
    const out = { orders: {}, payments: {} } as OrderSeedIds;
    for (const plan of ORDERS) {
        const shop = await shopOf(plan.customer);
        const pointId = points[plan.counterparty];
        const order = await placeOrder(shop, variantId, pointId);
        out.orders[plan.key] = { ...order, pointId };
        if (plan.proformas === 'issued-cancelled') {
            const first = await issued(shop, order.code);
            await admin(`mutation($id: ID!) { withdrawProformaInvoice(id: $id) { id } }`, {
                id: first.id,
            });
            const second = await issued(shop, order.code);
            out.aOwnProformas = { cancelled: pick(first), issued: pick(second) };
        }
        if (plan.proformas === 'paid') {
            out.payments[plan.key as PaymentKey] = await pay(shop, admin, order.code, plan.key);
            await settle(admin, order.id);
        }
    }
    return out;
}

async function pay(shop: Shop, admin: Shop, code: string, key: OrderKey): Promise<SeedPayment> {
    const proforma = await issued(shop, code);
    await shop(
        `mutation($id: ID!) { payProformaInvoice(proformaInvoiceId: $id, status: "success") { id } }`,
        { id: proforma.id },
    );
    const payments = await admin<{
        visiblePayments: {
            items: { id: string; proformaInvoiceId: string; paymentStatus: string }[];
        };
    }>(
        `{ visiblePayments(options: { take: 100 }) { items { id proformaInvoiceId paymentStatus } } }`,
    );
    const payment = payments.visiblePayments.items.find(
        p => p.proformaInvoiceId === proforma.id && p.paymentStatus === 'captured',
    );
    if (!payment) throw new Error(`payProformaInvoice left no captured payment for ${code}`);
    const refundMarker = `access-refund-${key}`;
    await admin(
        `mutation($p: ID!, $r: String!) { recordPaymentRefund(paymentId: $p, amount: 100,
            reason: "access seed refund", providerRefundId: $r) { id } }`,
        { p: payment.id, r: refundMarker },
    );
    return { id: payment.id, proforma: pick(proforma), refundMarker };
}

// A paid order awaits shipment (the dashboard's PaymentSettled tile).
async function settle(admin: Shop, orderId: string): Promise<void> {
    const found = await admin<{ order: { payments: { id: string; state: string }[] } }>(
        `query($id: ID!) { order(id: $id) { payments { id state } } }`,
        { id: orderId },
    );
    const payment = found.order.payments.find(p => p.state === 'Authorized');
    if (!payment) throw new Error(`Order ${orderId} has no authorized payment to settle`);
    const settled = await admin<{ settlePayment: Result }>(
        `mutation($id: ID!) { settlePayment(id: $id) { __typename ... on ErrorResult { message } } }`,
        { id: payment.id },
    );
    if (settled.settlePayment.__typename !== 'Payment')
        throw new Error(`settlePayment ${orderId}: ${settled.settlePayment.message ?? ''}`);
}
