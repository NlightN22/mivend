import { adminGql, shopGql, shopLoginCookie } from '../../helpers/api';
import type { VisIds } from './ids';
import { CUSTOMERS, PRODUCT, VIS_PASSWORD, customerEmail } from './plan';

type Shop = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

interface Result {
    __typename: string;
    message?: string;
    code?: string;
}

function ok(step: string, result: Result): void {
    if (result.__typename !== 'Order')
        throw new Error(`${step}: ${result.__typename} ${result.message ?? ''}`);
}

// The storefront checkout: pick the point, add a line, choose pickup, pay on terms.
async function placeOrder(shop: Shop, variantId: string, pointId: string): Promise<string> {
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
            __typename ... on Order { code } ... on ErrorResult { message } } }`,
    );
    ok('addPaymentToOrder', paid.addPaymentToOrder);
    const code = paid.addPaymentToOrder.code;
    if (!code) throw new Error('addPaymentToOrder returned no order code');
    return code;
}

interface Proforma {
    id: string;
    status: string;
}

// One placed order per customer with one paid proforma.
export async function seedOrders(superadmin: string, ids: VisIds): Promise<void> {
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
        const code = await placeOrder(shop, variantId, ids.points[customer.client]);
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
