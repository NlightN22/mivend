// Seeds one unsent order whose lines show every flag of the manager order card (#320): stock shortage and a
// failed automatic reserve, a price below the floor, a discount that ends below the floor, a discount over the
// viewing employee's limit, a pending price approval, a contract the buyer lacks, and a credit finding at the total.
// Everything goes through erp-import and product mutations; idempotent. Local contour only.
//
// Run: node infrastructure/scripts/seed-order-flags.mjs (server running, `make seed-all` done; PORT defaults to 3000).

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const IMPORT_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const BUYER_EMAIL = 'ivan@autoservice-nord.example';
const MANUFACTURER = 'seed-flags-mfr';
const ORGANIZATION = 'org-seed-flags';
const LIMIT_PERCENT = 80;
// [sku, sale price, purchase price, stock, quantity, organization erp id]; the floor is purchase x 1.1.
// Requested manual prices below are in minor units, so 100 here is 10000 there.
const PRODUCTS = [
    ['FLAG-STOCK-01', 300, 200, 20, 5, 'org-001'],
    ['FLAG-FLOOR-01', 100, 100, 20, 1, 'org-001'],
    ['FLAG-LIMIT-01', 200, 100, 20, 1, 'org-001'],
    ['FLAG-DISCFLOOR-01', 200, 100, 20, 1, 'org-001'],
    ['FLAG-PENDING-01', 200, 100, 20, 1, 'org-001'],
    ['FLAG-CONTRACT-01', 100, 50, 20, 1, ORGANIZATION],
    ['FLAG-CREDIT-01', 200000, 100, 20, 1, 'org-001'],
];
const LOWERED_STOCK = ['FLAG-STOCK-01', 2];
const WAREHOUSE = 'wh-central';

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

async function login(username, password) {
    const { authToken } = await gql(
        'admin-api',
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: username, p: password },
    );
    if (!authToken) throw new Error(`Login failed for ${username}`);
    return authToken;
}

async function admin(query, variables, token) {
    return (await gql('admin-api', query, variables, token)).data;
}

async function importBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${IMPORT_TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (result.failed > 0) throw new Error(`Import failed: ${JSON.stringify(result.errors)}`);
}

async function importOrganization() {
    await importBatch('seed-order-flags-organization-v1', [
        {
            type: 'organizationRequisites',
            data: {
                erpId: ORGANIZATION,
                legalName: 'Seed Flags Trading Co.',
                inn: '000000000099',
                kpp: '000000099',
                ogrn: '0000000000099',
                legalAddress: '9 Demo Avenue, Sample City',
                bankName: 'Demo Bank',
                bankAccount: '00000000000000000099',
                bankBik: '000000000',
                correspondentAccount: '00000000000000000000',
                signatoryName: 'D. Sample',
                signatoryTitle: 'General Director',
            },
        },
    ]);
    await importBatch('seed-order-flags-contract-v1', [
        {
            type: 'contract',
            data: {
                erpId: 'ctr-seed-flags-org-001',
                counterpartyErpId: 'cnt-001',
                name: 'Seed flags contract org-001',
                organizationId: 'org-001',
                priceTypeId: 'WHOLESALE',
                debtDaysLimit: 0,
                isActive: true,
                isCustomerContract: true,
            },
        },
    ]);
}

// The ERP checks judge a line only where it has a storage place and an organization stock row.
function storageRecords(sku, organization, quantity) {
    const base = { productErpId: `seed-${sku}`, organizationErpId: organization };
    return [
        {
            type: 'storageLocation',
            data: { entityId: `seed-flags-sl-${sku}`, warehouseErpId: WAREHOUSE, ...base },
        },
        {
            type: 'stockOrganization',
            data: { entityId: `seed-flags-so-${sku}`, quantity, ...base },
        },
    ];
}

async function importCatalog(organizationIds) {
    const records = [];
    for (const [sku, sale, purchase, stock, , organization] of PRODUCTS) {
        records.length = 0;
        records.push(
            {
                type: 'product',
                data: {
                    externalId: `seed-${sku}`,
                    sku,
                    name: `Seed flags: ${sku.toLowerCase()}`,
                    slug: `seed-flags-${sku.toLowerCase()}`,
                    price: sale,
                    stockOnHand: stock,
                    categoryCode: 'cat-engine-filters',
                    brandCode: 'mann',
                    manufacturerCode: MANUFACTURER,
                    organizationId: organizationIds[organization],
                },
            },
            ...[
                ['WHOLESALE', sale],
                ['PURCHASE', purchase],
            ].map(([priceTypeCode, price]) => ({
                type: 'price',
                data: { productExternalId: `seed-${sku}`, priceTypeCode, price },
            })),
            { type: 'stock', data: { sku, stockOnHand: stock } },
        );
        await importBatch(`seed-order-flags-${sku}-v2`, records);
        await importBatch(
            `seed-order-flags-storage-${sku}-v1`,
            storageRecords(sku, organization, stock),
        );
    }
}

async function organizationIds(token) {
    const { organizationRequisites } = await admin(
        `{ organizationRequisites { id erpId } }`,
        undefined,
        token,
    );
    return Object.fromEntries(organizationRequisites.map(o => [o.erpId, Number(o.id)]));
}

async function allowDiscounts(superToken) {
    const { administrators } = await admin(
        `{ administrators(options: { take: 50 }) { items { id emailAddress } } }`,
        undefined,
        superToken,
    );
    for (const email of ['olga.depthead@mivend.dev', 'nikolai.director@mivend.dev']) {
        const id = administrators.items.find(a => a.emailAddress === email).id;
        await admin(
            `mutation($a: ID!, $r: String!, $p: Float!) { setDiscountLimit(administratorId: $a, scopeKind: "manufacturer", scopeRef: $r, maxDiscountPercent: $p) { uuid } }`,
            { a: id, r: MANUFACTURER, p: LIMIT_PERCENT },
            superToken,
        );
    }
    return administrators.items.find(a => a.emailAddress === 'petr.manager@mivend.dev').id;
}

async function alreadySeeded(token) {
    const { orders } = await admin(
        `{ orders(options: { take: 100, sort: { createdAt: DESC } }) { items { state lines { productVariant { sku } } } } }`,
        undefined,
        token,
    );
    return orders.items.some(
        o => o.state !== 'Cancelled' && o.lines.some(l => l.productVariant.sku === PRODUCTS[0][0]),
    );
}

async function addLines(orderId, token) {
    const { productVariants } = await admin(
        `query($f: String!) { productVariants(options: { filter: { sku: { contains: $f } } }) { items { id sku } } }`,
        { f: 'FLAG-' },
        token,
    );
    const lineBySku = {};
    for (const [sku, , , , quantity] of PRODUCTS) {
        const variant = productVariants.items.find(v => v.sku === sku);
        const added = await admin(
            `mutation($o: ID!, $i: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $o, input: $i) { __typename ... on Order { lines { id productVariant { sku } } } ... on ErrorResult { message } } }`,
            { o: orderId, i: { productVariantId: variant.id, quantity } },
            token,
        );
        const result = added.addItemToDraftOrder;
        if (result.__typename !== 'Order') throw new Error(JSON.stringify(result));
        for (const line of result.lines) lineBySku[line.productVariant.sku] = line.id;
    }
    return lineBySku;
}

// Order visibility for a manager is filled in by the worker shortly after the order appears.
async function requestPrice(orderId, lineId, price, token) {
    for (let attempt = 0; ; attempt++) {
        try {
            const { requestPriceAdjustment } = await admin(
                `mutation($o: ID!, $l: ID!, $p: Int!) { requestPriceAdjustment(orderId: $o, orderLineId: $l, requestedPrice: $p, justification: "seed-order-flags") { decision approvalRequestId } }`,
                { o: orderId, l: lineId, p: price },
                token,
            );
            return requestPriceAdjustment;
        } catch (error) {
            if (attempt >= 20 || !String(error.message).startsWith('No Order')) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// The manager has no limit row, so every request goes to approval, through the chain of approvers with a limit row.
async function adjustPrices(orderId, lines, manager, approvers) {
    for (const [sku, price] of [
        ['FLAG-LIMIT-01', 15300],
        ['FLAG-DISCFLOOR-01', 10500],
    ]) {
        const request = await requestPrice(orderId, lines[sku], price, manager);
        for (const approver of request.approvalRequestId ? approvers : []) {
            const decided = await admin(
                `mutation($r: ID!) { decidePriceAdjustmentRequest(requestId: $r, decision: "approved") { status } }`,
                { r: request.approvalRequestId },
                approver,
            );
            if (decided.decidePriceAdjustmentRequest.status === 'approved') break;
        }
    }
    await requestPrice(orderId, lines['FLAG-PENDING-01'], 10500, manager);
}

// A manager sees only the orders of his own counterparties, so an unowned buyer is given to him.
async function ensureManagerOwnsBuyer(superToken, managerId) {
    const { counterparties } = await admin(
        `{ counterparties(options: { take: 100 }) { items { id erpId assignedManagerId } } }`,
        undefined,
        superToken,
    );
    const buyer = counterparties.items.find(c => c.erpId === 'cnt-001');
    if (buyer.assignedManagerId) return;
    await admin(
        `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
        { c: buyer.id, a: managerId },
        superToken,
    );
}

async function placeOrder(orderId, token) {
    await admin(
        `mutation($o: ID!) { setDraftOrderShippingAddress(orderId: $o, input: { fullName: "AutoService Nord", streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU" }) { __typename } }`,
        { o: orderId },
        token,
    );
    const methods = await admin(
        `query($o: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $o) { id } }`,
        { o: orderId },
        token,
    );
    await admin(
        `mutation($o: ID!, $m: ID!) { setDraftOrderShippingMethod(orderId: $o, shippingMethodId: $m) { __typename } }`,
        { o: orderId, m: methods.eligibleShippingMethodsForDraftOrder[0].id },
        token,
    );
    await admin(
        `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { __typename } }`,
        { id: orderId },
        token,
    );
    const paid = await admin(
        `mutation($o: ID!) { addManualPaymentToOrder(input: { orderId: $o, method: "offline-terms", transactionId: "seed-order-flags", metadata: {} }) { __typename ... on ErrorResult { message } } }`,
        { o: orderId },
        token,
    );
    if (paid.addManualPaymentToOrder.__typename !== 'Order')
        throw new Error(JSON.stringify(paid.addManualPaymentToOrder));
}

async function main() {
    const superToken = await login('superadmin', 'superadmin');
    const director = await login('nikolai.director@mivend.dev', 'Password123!');
    const head = await login('olga.depthead@mivend.dev', 'Password123!');
    const manager = await login('petr.manager@mivend.dev', 'Password123!');
    if (await alreadySeeded(director)) {
        console.log('The flags order already exists, skipped.');
        return;
    }
    await importOrganization();
    await importCatalog(await organizationIds(director));
    const managerId = await allowDiscounts(superToken);
    await ensureManagerOwnsBuyer(superToken, managerId);

    const { customers } = await admin(
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: BUYER_EMAIL },
        director,
    );
    const { createDraftOrder } = await admin(`mutation { createDraftOrder { id } }`, {}, director);
    const orderId = createDraftOrder.id;
    await admin(
        `mutation($o: ID!, $c: ID!) { setCustomerForDraftOrder(orderId: $o, customerId: $c) { __typename } }`,
        { o: orderId, c: customers.items[0].id },
        director,
    );
    try {
        const lines = await addLines(orderId, director);
        await adjustPrices(orderId, lines, manager, [head, director]);
        const [lowered, left] = LOWERED_STOCK;
        const organization = PRODUCTS.find(p => p[0] === lowered)[5];
        await importBatch('seed-order-flags-lowered-stock-v2', [
            { type: 'stock', data: { sku: lowered, stockOnHand: left } },
            ...storageRecords(lowered, organization, left).slice(1),
        ]);
        await placeOrder(orderId, director);
    } catch (error) {
        await admin(
            `mutation($o: ID!) { deleteDraftOrder(orderId: $o) { result } }`,
            { o: orderId },
            superToken,
        ).catch(() => {});
        throw error;
    }
    await admin(
        `mutation($o: ID!) { recomputeOrderChecks(orderId: $o) { id } }`,
        { o: orderId },
        superToken,
    );
    console.log(`Flags order created (order id ${orderId}).`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
