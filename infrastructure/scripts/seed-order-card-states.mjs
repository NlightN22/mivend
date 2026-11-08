// Orders for the manager order card (#320): one with a real ERP status history, one rejected by the ERP, one whose
// manual payment still waits for confirmation. Goes through the shop API and the ERP order-status callback; idempotent
// (the shipping name is the marker). Local contour only (ERP_CALLBACK_ENABLED).
//
// Run: node infrastructure/scripts/seed-order-card-states.mjs (server running, seed-all done; PORT defaults to 3000).

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const CALLBACK_KEY = process.env.ERP_CALLBACK_API_KEY ?? 'dev-callback-key-change-me-0000';
const BUYER = ['ivan@autoservice-nord.example', 'Password123!'];
const SKU = 'FIL-AIR-A004';
const ORDERS = [
    { name: 'Seed Card History', statuses: ['SENT_TO_ERP', 'CONFIRMED', 'PICKING', 'SHIPPING'] },
    { name: 'Seed Card Rejected', statuses: ['SENT_TO_ERP', 'REJECTED'] },
    { name: 'Seed Card Awaiting Payment', statuses: [] },
];

async function gql(api, query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/${api}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken: res.headers.get('vendure-auth-token') };
}

async function login(api, username, password) {
    const { authToken } = await gql(
        api,
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: username, p: password },
    );
    if (!authToken) throw new Error(`Login failed for ${username}`);
    return authToken;
}

async function placeOrder(customer, variantId, name) {
    const shop = (query, variables) =>
        gql('shop-api', query, variables, customer).then(r => r.data);
    await shop(`mutation { removeAllOrderLines { __typename } }`);
    await shop(
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
        {
            id: variantId,
        },
    );
    await shop(
        `mutation($n: String!) { setOrderShippingAddress(input: { fullName: $n, streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU" }) { __typename } }`,
        { n: name },
    );
    const methods = await shop(`query { eligibleShippingMethods { id } }`);
    await shop(
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
        {
            id: [methods.eligibleShippingMethods[0].id],
        },
    );
    const placed = await shop(
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on Order { code } } }`,
    );
    await shop(
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
    );
    return placed.transitionOrderToState.code;
}

async function reportStatus(orderCode, status) {
    const res = await fetch(`${BASE_URL}/erp/callback/order-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': CALLBACK_KEY },
        body: JSON.stringify({ orderCode, status, erpOrderId: `erp-${orderCode}` }),
    });
    if (!res.ok) throw new Error(`Callback failed: HTTP ${res.status}`);
}

async function main() {
    const admin = await login('admin-api', 'superadmin', 'superadmin');
    const { data } = await gql(
        'admin-api',
        `{ orders(options: { take: 200, sort: { createdAt: DESC } }) { items { shippingAddress { fullName } } } productVariants(options: { filter: { sku: { eq: "${SKU}" } } }) { items { id } } }`,
        undefined,
        admin,
    );
    const names = new Set(data.orders.items.map(o => o.shippingAddress?.fullName));
    const variantId = data.productVariants.items[0].id;
    const customer = await login('shop-api', ...BUYER);
    for (const { name, statuses } of ORDERS) {
        if (names.has(name)) continue;
        const code = await placeOrder(customer, variantId, name);
        for (const status of statuses) {
            await reportStatus(code, status);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log(`${name}: order ${code}`);
    }
    console.log('Done.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
