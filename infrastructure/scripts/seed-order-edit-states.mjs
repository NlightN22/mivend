// Seeds the order states needed to see the manager order-edit UI (#233) and held sends (#237) locally:
//   1. an unsent order with three lines, one short on its own organization's stock and one on a second line
//      with plenty, so "Cut lines to available stock", "Remove? Yes/No" on a non-last line and the
//      last-line restriction can be seen;
//   2. an order whose send to the ERP is held by policy, so the dashboard Outbound tab shows
//      "Sends held by policy" and the alert integration-outbox-held fires.
// Organization master data (storage places, organization stock, contracts) goes through the erp-import
// record types `storageLocation`, `stockOrganization`, `contract`. Local contour only; idempotent.
//
// Run: make seed-order-edit-states (server running, `make seed-all` done).

import { execSync } from 'node:child_process';

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const CUSTOMER_EMAIL = 'credit-limited@buyer.example';
const CUSTOMER_ID_ERP = 'cnt-credit-limited';
const WAREHOUSE = 'wh-central';
const EDIT_MARK = 'seed-order-edit-states';
const HELD_REASON = 'held by an order check policy (pre-send-to-erp)';
const HELD_SKU = 'BELT-DRIVE-V501';
// [sku, product ERP id, organization ERP id, organization stock, ordered quantity]
const EDIT_LINES = [
    ['FIL-AIR-A004', 'ext-004', 'org-001', 50, 2],
    ['MOT-10W40-4L', 'ext-002', 'org-002', 1, 3],
    ['FIL-OIL-C001', 'ext-003', 'org-003', 50, 2],
];
const HELD_PRODUCT = { erpId: 'ext-026', organization: 'org-002' };

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

async function postBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (result.failed > 0) throw new Error(`Import failed: ${JSON.stringify(result.errors)}`);
}

function sql(query) {
    return execSync(
        `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -tAc ${JSON.stringify(query)}`,
    )
        .toString()
        .trim();
}

async function seedOrganizationData() {
    const products = [
        ...EDIT_LINES.map(([, product, organization, stock]) => ({ product, organization, stock })),
        { product: HELD_PRODUCT.erpId, organization: HELD_PRODUCT.organization, stock: 0 },
    ];
    const records = [];
    for (const { product, organization, stock } of products) {
        records.push(
            {
                type: 'storageLocation',
                data: {
                    entityId: `seed-sl-${product}-${organization}`,
                    productErpId: product,
                    organizationErpId: organization,
                    warehouseErpId: WAREHOUSE,
                },
            },
            {
                type: 'stockOrganization',
                data: {
                    entityId: `seed-so-${product}-${organization}`,
                    productErpId: product,
                    organizationErpId: organization,
                    quantity: stock,
                },
            },
        );
    }
    for (const organization of ['org-002', 'org-003']) {
        records.push({
            type: 'contract',
            data: {
                erpId: `ctr-seed-${CUSTOMER_ID_ERP}-${organization}`,
                counterpartyErpId: CUSTOMER_ID_ERP,
                name: `Seed contract ${organization}`,
                organizationId: organization,
                priceTypeId: 'WHOLESALE',
                debtDaysLimit: 0,
                isActive: true,
            },
        });
    }
    await postBatch(`seed-order-edit-organization-data-${CUSTOMER_ID_ERP}`, records);
    console.log(`Organization data: ${records.length} records imported.`);
}

async function createUnsentOrder(adminToken, customerId, variants) {
    const { data } = await gql(
        'admin-api',
        `mutation { createDraftOrder { id } }`,
        undefined,
        adminToken,
    );
    const orderId = data.createDraftOrder.id;
    try {
        await gql(
            'admin-api',
            `mutation($o: ID!, $c: ID!) { setCustomerForDraftOrder(orderId: $o, customerId: $c) { __typename } }`,
            { o: orderId, c: customerId },
            adminToken,
        );
        for (const { id, quantity } of variants) {
            const added = await gql(
                'admin-api',
                `mutation($o: ID!, $i: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $o, input: $i) { __typename ... on ErrorResult { message } } }`,
                { o: orderId, i: { productVariantId: id, quantity } },
                adminToken,
            );
            if (added.data.addItemToDraftOrder.__typename !== 'Order')
                throw new Error(JSON.stringify(added.data.addItemToDraftOrder));
        }
        await gql(
            'admin-api',
            `mutation($o: ID!) { setDraftOrderShippingAddress(orderId: $o, input: { fullName: "AutoService Nord", streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU" }) { __typename } }`,
            { o: orderId },
            adminToken,
        );
        const methods = await gql(
            'admin-api',
            `query($o: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $o) { id } }`,
            { o: orderId },
            adminToken,
        );
        await gql(
            'admin-api',
            `mutation($o: ID!, $m: ID!) { setDraftOrderShippingMethod(orderId: $o, shippingMethodId: $m) { __typename } }`,
            { o: orderId, m: methods.data.eligibleShippingMethodsForDraftOrder[0].id },
            adminToken,
        );
        await gql(
            'admin-api',
            `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { __typename } }`,
            { id: orderId },
            adminToken,
        );
        const paid = await gql(
            'admin-api',
            `mutation($o: ID!, $t: String!) { addManualPaymentToOrder(input: { orderId: $o, method: "offline-terms", transactionId: $t, metadata: {} }) { __typename ... on ErrorResult { message } } }`,
            { o: orderId, t: EDIT_MARK },
            adminToken,
        );
        if (paid.data.addManualPaymentToOrder.__typename !== 'Order')
            throw new Error(JSON.stringify(paid.data.addManualPaymentToOrder));
        return orderId;
    } catch (error) {
        await gql(
            'admin-api',
            `mutation($o: ID!) { deleteDraftOrder(orderId: $o) { result } }`,
            { o: orderId },
            adminToken,
        ).catch(() => {});
        throw error;
    }
}

async function seedEditOrder(adminToken, customerId, variantBySku) {
    if (sql(`select count(*) from payment where "transactionId" = '${EDIT_MARK}'`) !== '0') {
        console.log('Edit-states order already exists, skipped.');
        return;
    }
    const variants = EDIT_LINES.map(([sku, , , , quantity]) => ({
        id: variantBySku[sku],
        quantity,
    }));
    const id = await createUnsentOrder(adminToken, customerId, variants);
    console.log(`Unsent order with ${variants.length} lines created (order id ${id}).`);
}

async function setSendPolicy(adminToken, consequence) {
    await gql(
        'admin-api',
        `mutation($c: String!) { updateCheckPolicy(input: { checkCode: "erp.organization-stock", stage: "pre-send-to-erp", consequence: $c, enabled: true }) { consequence } }`,
        { c: consequence },
        adminToken,
    );
}

// A held row cannot be produced by the live flow on demand: an automatic reserve already stops at the
// same hold. So the order is reserved under `warn`, then the policy becomes `hold` and the order's still
// unsent `order.confirmed` row is marked as held by the same marker the builder writes (the one raw-SQL
// exception to the seed rule; the held-send sweep treats it like any other held row).
async function seedHeldSend(adminToken, variantBySku) {
    const heldCount = () =>
        Number(
            sql(
                `select count(*) from integration_outbox where status = 'skipped' and last_error = '${HELD_REASON}'`,
            ),
        );
    if (heldCount() > 0) {
        console.log('A held send already exists, skipped.');
        return;
    }
    await setSendPolicy(adminToken, 'warn');
    const customer = await login('shop-api', CUSTOMER_EMAIL, 'Password123!');
    await gql('shop-api', `mutation { removeAllOrderLines { __typename } }`, undefined, customer);
    await gql(
        'shop-api',
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
        { id: variantBySku[HELD_SKU] },
        customer,
    );
    await gql(
        'shop-api',
        `mutation { setOrderShippingAddress(input: { fullName: "AutoService Nord", streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU" }) { __typename } }`,
        undefined,
        customer,
    );
    const methods = await gql(
        'shop-api',
        `query { eligibleShippingMethods { id } }`,
        undefined,
        customer,
    );
    await gql(
        'shop-api',
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
        { id: [methods.data.eligibleShippingMethods[0].id] },
        customer,
    );
    const placed = await gql(
        'shop-api',
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on Order { id } } }`,
        undefined,
        customer,
    );
    const orderId = placed.data.transitionOrderToState.id;
    await gql(
        'shop-api',
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        undefined,
        customer,
    );
    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const updated = sql(
            `update integration_outbox set status = 'skipped', last_error = '${HELD_REASON}', last_error_at = now() where event_type = 'order.confirmed' and status = 'pending' and payload ->> 'orderId' = '${orderId}' returning id`,
        );
        if (updated) {
            await setSendPolicy(adminToken, 'hold');
            console.log(
                `Order ${orderId} reserved, its send is held (policy hold on erp.organization-stock at pre-send-to-erp).`,
            );
            return;
        }
    }
    throw new Error(`Order ${orderId} was not reserved automatically; no send to hold.`);
}

async function main() {
    const adminToken = await login('admin-api', 'nikolai.director@mivend.dev', 'Password123!');
    await seedOrganizationData();
    const variants = await gql(
        'admin-api',
        `{ productVariants(options: { take: 200 }) { items { id sku } } }`,
        undefined,
        adminToken,
    );
    const variantBySku = Object.fromEntries(
        variants.data.productVariants.items.map(v => [v.sku, v.id]),
    );
    const customers = await gql(
        'admin-api',
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: CUSTOMER_EMAIL },
        adminToken,
    );
    await seedEditOrder(adminToken, customers.data.customers.items[0].id, variantBySku);
    await seedHeldSend(adminToken, variantBySku);
    console.log('Done.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
