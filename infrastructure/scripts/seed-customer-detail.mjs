// Tops up every tab on the CustomerDetailPage (Orders/Invoices/Documents/History) for one demo
// customer (ivan@autoservice-nord.example / counterparty cnt-001) past its tab's page size (20),
// so pagination is actually exercisable in dev/manual QA — see AGENTS.md's pagination rule and
// the real incident it documents (pagination-scroll.spec.ts self-skipping on thin lists).
//
// Idempotent: each section checks its current count for this customer/counterparty first and
// only creates the difference up to TARGET_COUNT. Safe to re-run.
//
// Invoice (plugin-acquiring) is only ever materialized by the payment-method handlers'
// createPayment (apps/server/src/payment-method-handlers.ts's computeInvoiceSplit) — there is no
// GraphQL mutation to create one directly, by design (an Invoice must only ever come from a real
// checkout, never be synthesized). So Orders/Invoices/Payments here are all seeded together via
// one real shop-api checkout per order (login as the customer, add items, pay), cycling through
// 'online-stub' (succeeded/pending) and 'offline-terms' — the same real code path a storefront
// checkout uses. This also means a real checkout with online-stub 'succeeded' produces a real
// captured PaymentAttempt, which `make seed-payment-refunds` can then pick up.
//
// Run: node infrastructure/scripts/seed-customer-detail.mjs
// Requires: server running, `make seed-all` already run (customer ivan@..., counterparty cnt-001,
// trading points tp-001..003, branch branch-central, organization requisites must exist).

import { execSync } from 'node:child_process';

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';
const TARGET_COUNT = 50;
const CUSTOMER_EMAIL = 'ivan@autoservice-nord.example';
const CUSTOMER_PASSWORD = 'Password123!';
const COUNTERPARTY_ERP_ID = 'cnt-001';

async function adminGql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/admin-api`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken };
}

async function shopGql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/shop-api`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken };
}

async function adminLogin(username, password) {
    const { data, authToken } = await adminGql(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}`,
        { u: username, p: password },
    );
    if (!authToken) throw new Error(`Admin login failed for ${username}: ${JSON.stringify(data)}`);
    return authToken;
}

async function shopLogin(username, password) {
    const { data, authToken } = await shopGql(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}`,
        { u: username, p: password },
    );
    if (!authToken) throw new Error(`Shop login failed for ${username}: ${JSON.stringify(data)}`);
    return authToken;
}

// Real end-to-end checkout — same shop-api mutations/sequence as
// packages/e2e/storefront/orders/helpers.ts's placeTestOrder, plus a payment. `variantIds` can be
// one or several (a multi-organization order needs 2+ variants from different organizations so
// InvoiceService.computeSplit actually produces more than one Invoice for the order — see
// packages/e2e/storefront/invoices/helpers.ts's pickTwoVariantsFromDifferentOrganizations).
// `paymentPlan` selects which payment-method handler code path to exercise (see
// payment-method-handlers.ts):
// 'online-succeeded' -> Settled order, Invoice(s) 'paid', real PaymentAttempt 'success'
// 'online-pending'   -> Authorized order, Invoice(s) 'issued', real PaymentAttempt 'pending'
// 'online-failed'    -> Declined order, Invoice(s) stay 'pending' (never touched), PaymentAttempt 'failed'
// 'offline-terms'    -> Authorized order, Invoice(s) 'issued', no PaymentAttempt (deferred payment)
async function checkoutOneOrder(customerToken, variantIds, paymentPlan) {
    await shopGql(`mutation { transitionOrderToState(state: "AddingItems") { __typename } }`, undefined, customerToken).catch(() => {});
    await shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, customerToken);
    for (const variantId of variantIds) {
        await shopGql(
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
            { id: variantId },
            customerToken,
        );
    }
    await shopGql(
        `mutation { setOrderShippingAddress(input: {
            fullName: "AutoService Nord", streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU"
        }) { __typename } }`,
        undefined,
        customerToken,
    );
    const methodsData = await shopGql(`query { eligibleShippingMethods { id } }`, undefined, customerToken);
    const methodId = methodsData.data.eligibleShippingMethods[0]?.id;
    if (methodId) {
        await shopGql(
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methodId] },
            customerToken,
        );
    }
    const transition = await shopGql(
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on Order { id code } } }`,
        undefined,
        customerToken,
    );
    if (transition.data.transitionOrderToState.__typename !== 'Order') {
        throw new Error(`Could not move order to ArrangingPayment: ${JSON.stringify(transition.data)}`);
    }
    const orderId = transition.data.transitionOrderToState.id;

    if (paymentPlan === 'unpaid') {
        // Leave the order in ArrangingPayment with no payment attempt at all — no Invoice is
        // materialized either (computeInvoiceSplit only runs inside createPayment), so this plan
        // exists purely to give the Orders tab an "unpaid, nothing attempted yet" row; it must
        // not be counted toward the Invoice top-up target (see caller).
        return { id: orderId, invoiceCount: 0 };
    }

    // Inline literal (not a $input variable) to match the exact shape
    // packages/e2e/storefront/invoices/helpers.ts's addPaymentToOrder calls use.
    const method = paymentPlan === 'offline-terms' ? 'offline-terms' : 'online-stub';
    const metadataLiteral = paymentPlan === 'online-pending' ? '{ status: "pending" }'
        : paymentPlan === 'online-failed' ? '{ status: "fail" }'
        : '{}';
    const payment = await shopGql(
        `mutation { addPaymentToOrder(input: { method: "${method}", metadata: ${metadataLiteral} }) { __typename ... on Order { id code } } }`,
        undefined,
        customerToken,
    );
    // 'online-failed' legitimately returns a Declined order (__typename 'OrderStateTransitionError'
    // or similar) — that's the expected outcome, not a script bug.
    if (paymentPlan !== 'online-failed' && payment.data.addPaymentToOrder.__typename !== 'Order') {
        throw new Error(`Payment failed for order: ${JSON.stringify(payment.data)}`);
    }
    return { id: orderId, invoiceCount: variantIds.length };
}

// Pays exactly one invoice of an already-created multi-invoice order via the real customer-facing
// payInvoice mutation (shop-api, Permission.Owner) — the direct, per-invoice equivalent of what a
// customer does from the invoice detail page. Leaves the order's other invoice(s) at 'issued',
// which is what makes the order show up as "Partially paid" (CustomerOrdersTab's real captured-vs-
// total comparison), not just "every invoice has the same status" like a single checkout produces.
async function payOneInvoice(customerToken, invoiceId) {
    await shopGql(
        `mutation($invoiceId: ID!) { payInvoice(invoiceId: $invoiceId, status: "success", channel: "online-acquiring") { id status } }`,
        { invoiceId },
        customerToken,
    );
}

async function topUpOrdersInvoicesAndPayments(directorToken, counterpartyId, variantIds, variantsByOrg) {
    const existing = await adminGql(
        `query($options: InvoiceListOptions, $counterpartyId: ID) {
            visibleInvoices(options: $options, counterpartyId: $counterpartyId) { totalItems }
        }`,
        { options: { take: 0 }, counterpartyId },
        directorToken,
    );
    const currentCount = existing.data.visibleInvoices.totalItems;
    const toCreate = Math.max(0, TARGET_COUNT - currentCount);
    console.log(`Invoices: ${currentCount} existing for counterparty ${counterpartyId}, checking out orders for ${toCreate} more...`);

    const customerToken = await shopLogin(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

    if (toCreate > 0) {
        // Cycle index starts at currentCount, not 0 — otherwise every incremental top-up run
        // (currentCount rising a little at a time across reruns) always starts the plans cycle
        // over from 'online-succeeded' and never reaches the later plans (real incident: several
        // small top-up runs in a row never produced a single 'online-failed'/pending-Invoice
        // example because toCreate was never large enough in one run to loop that far).
        const plans = ['online-succeeded', 'online-succeeded', 'online-pending', 'offline-terms', 'online-failed'];
        let created = 0;
        let i = currentCount;
        while (created < toCreate) {
            const variantId = variantIds[i % variantIds.length];
            const plan = plans[i % plans.length];
            const result = await checkoutOneOrder(customerToken, [variantId], plan);
            created += result.invoiceCount;
            i++;
        }
    }

    // A handful of genuinely unpaid orders (no payment attempted at all) and multi-organization
    // partially-paid orders — small fixed targets, checked independently of the invoice count
    // above so they don't get skipped once that target is already met.
    const orgIds = Object.keys(variantsByOrg);
    if (orgIds.length >= 2) {
        const partialTarget = 4;
        const existingPartial = await adminGql(
            `query($customerId: ID!, $options: OrderListOptions) {
                customerOrdersByPaymentView(customerId: $customerId, paymentView: "partial", options: $options) { totalItems }
            }`,
            { customerId: await resolveVendureCustomerId(directorToken), options: { take: 0 } },
            directorToken,
        );
        const existingPartialCount = existingPartial.data.customerOrdersByPaymentView.totalItems;
        const partialToCreate = Math.max(0, partialTarget - existingPartialCount);
        console.log(`Partially-paid orders: ${existingPartialCount} existing, creating ${partialToCreate} more...`);
        for (let i = 0; i < partialToCreate; i++) {
            const [orgA, orgB] = [orgIds[i % orgIds.length], orgIds[(i + 1) % orgIds.length]];
            const variantA = variantsByOrg[orgA][0];
            const variantB = variantsByOrg[orgB][0];
            const result = await checkoutOneOrder(customerToken, [variantA, variantB], 'offline-terms');
            const invoicesRes = await adminGql(
                `query($orderId: ID!) { invoicesForOrder(orderId: $orderId) { id } }`,
                { orderId: result.id },
                directorToken,
            );
            const invoiceIds = invoicesRes.data.invoicesForOrder.map(inv => inv.id);
            if (invoiceIds.length >= 2) {
                await payOneInvoice(customerToken, invoiceIds[0]);
            }
        }
    }

    const existingUnpaid = await adminGql(
        `query($customerId: ID!, $options: OrderListOptions) {
            customerOrdersByPaymentView(customerId: $customerId, paymentView: "unpaid", options: $options) { totalItems }
        }`,
        { customerId: await resolveVendureCustomerId(directorToken), options: { take: 0 } },
        directorToken,
    );
    const unpaidTarget = 3;
    const unpaidToCreate = Math.max(0, unpaidTarget - existingUnpaid.data.customerOrdersByPaymentView.totalItems);
    console.log(`Genuinely-unpaid orders (no payment attempted): ${existingUnpaid.data.customerOrdersByPaymentView.totalItems} existing, creating ${unpaidToCreate} more...`);
    for (let i = 0; i < unpaidToCreate; i++) {
        await checkoutOneOrder(customerToken, [variantIds[i % variantIds.length]], 'unpaid');
    }
}

let vendureCustomerIdCache;
async function resolveVendureCustomerId(directorToken) {
    if (vendureCustomerIdCache) return vendureCustomerIdCache;
    const res = await adminGql(
        `{ customers(options: { take: 100 }) { items { id emailAddress } } }`,
        undefined,
        directorToken,
    );
    const customer = res.data.customers.items.find(c => c.emailAddress === CUSTOMER_EMAIL);
    if (!customer) throw new Error(`Customer ${CUSTOMER_EMAIL} not found — run \`make seed\` first.`);
    vendureCustomerIdCache = customer.id;
    return customer.id;
}

async function topUpDocuments() {
    const documents = [];
    for (let i = 1; i <= TARGET_COUNT; i++) {
        const type = i % 2 === 0 ? 'return' : 'reconciliation';
        documents.push({
            erpId: `doc-${COUNTERPARTY_ERP_ID}-${String(i).padStart(3, '0')}`,
            type,
            counterpartyErpId: COUNTERPARTY_ERP_ID,
            number: `${type === 'return' ? 'RET' : 'REC'}-2026-${String(i).padStart(4, '0')}`,
            issueDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            amount: 50000 + i * 12345,
            currencyCode: 'RUB',
            fileUrl: '/documents/sample-document.pdf',
            metadata: { seedIndex: i },
        });
    }
    console.log(`Documents: sending ${documents.length} for ${COUNTERPARTY_ERP_ID} (batch dedup makes reruns a no-op)...`);
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
            // Bump the version suffix whenever the batch's record count/content changes (mirrors
            // seed-erp.mjs's own 'v1'/'v2' comment) — erp-import's dedup-by-exchangeId returns
            // the cached prior result outright, so a same-exchangeId rerun with more records
            // silently processes none of the new ones (real incident: TARGET_COUNT bumped 25->30
            // here without bumping this, and the batch endpoint reported processed=25 for a
            // 30-record payload).
            exchangeId: `seed-customer-detail-documents-${COUNTERPARTY_ERP_ID}-v4`,
            records: documents.map(data => ({ type: 'document', data })),
        }),
    });
    const json = await res.json();
    console.log(`  → status=${json.status} processed=${json.processed} failed=${json.failed}`);
}

async function topUpHistory(token, tradingPointIds) {
    const refs = tradingPointIds.map(id => ({ entityName: 'TradingPoint', entityId: id }));
    const existing = await adminGql(
        `query($refs: [EntityRefInput!]!, $options: EntityVersionListOptions) {
            entityVersionsForEntities(refs: $refs, options: $options) { totalItems }
        }`,
        { refs, options: { take: 0 } },
        token,
    );
    const currentCount = existing.data.entityVersionsForEntities.totalItems;
    const toCreate = Math.max(0, TARGET_COUNT - currentCount);
    console.log(`History: ${currentCount} existing EntityVersion rows, creating ${toCreate} more...`);
    for (let i = 0; i < toCreate; i++) {
        const tradingPointId = tradingPointIds[i % tradingPointIds.length];
        // updateTradingPointDetails (not updateTradingPointComment) is the mutation that
        // actually calls VersioningService.recordChange — see TradingPointService.updateDetails.
        await adminGql(
            `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`,
            { id: tradingPointId, input: { workingHours: `Mon-Fri 09:00-18:00 (rev ${i + 1})` } },
            token,
        );
    }
}

// Real fulfillment progression via the same admin mutations manager-portal staff use — gives the
// Orders tab's Fulfillment column actual variety instead of every settled order sitting at "Not
// started" forever (real incident: only checkoutOneOrder's payment step was ever exercised, no
// order ever got fulfilled, so latestFulfillmentState stayed null for the whole demo customer).
async function topUpFulfillmentVariety(directorToken, customerId) {
    const target = { pending: 3, shipped: 3, delivered: 4 };
    const ordersRes = await adminGql(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 200 }) { items {
            id state customFields { latestFulfillmentState } lines { id quantity }
        } } } }`,
        { id: customerId },
        directorToken,
    );
    const settledUnfulfilled = ordersRes.data.customer.orders.items.filter(
        o => o.state === 'PaymentSettled' && !o.customFields.latestFulfillmentState,
    );
    const byState = ordersRes.data.customer.orders.items.reduce((acc, o) => {
        const s = o.customFields.latestFulfillmentState;
        if (s) acc[s] = (acc[s] ?? 0) + 1;
        return acc;
    }, {});
    console.log(`Fulfillment: existing Pending=${byState.Pending ?? 0} Shipped=${byState.Shipped ?? 0} Delivered=${byState.Delivered ?? 0}, ${settledUnfulfilled.length} settled orders available to fulfill...`);

    const plan = [
        ...Array(Math.max(0, target.pending - (byState.Pending ?? 0))).fill('Pending'),
        ...Array(Math.max(0, target.shipped - (byState.Shipped ?? 0))).fill('Shipped'),
        ...Array(Math.max(0, target.delivered - (byState.Delivered ?? 0))).fill('Delivered'),
    ];
    for (let i = 0; i < plan.length && i < settledUnfulfilled.length; i++) {
        const order = settledUnfulfilled[i];
        const targetState = plan[i];
        const fulfillRes = await adminGql(
            `mutation($input: FulfillOrderInput!) {
                addFulfillmentToOrder(input: $input) {
                    __typename
                    ... on Fulfillment { id state }
                    ... on ErrorResult { errorCode message }
                }
            }`,
            {
                input: {
                    lines: order.lines.map(l => ({ orderLineId: l.id, quantity: l.quantity })),
                    handler: { code: 'manual-fulfillment', arguments: [{ name: 'method', value: 'Standard shipping' }] },
                },
            },
            directorToken,
        );
        const fulfillment = fulfillRes.data.addFulfillmentToOrder;
        if (fulfillment.__typename !== 'Fulfillment') {
            console.warn(`  … fulfillment failed for order ${order.id}: ${fulfillment.message}`);
            continue;
        }
        if (targetState === 'Shipped' || targetState === 'Delivered') {
            await adminGql(
                `mutation($id: ID!) { transitionFulfillmentToState(id: $id, state: "Shipped") { __typename } }`,
                { id: fulfillment.id },
                directorToken,
            );
        }
        if (targetState === 'Delivered') {
            await adminGql(
                `mutation($id: ID!) { transitionFulfillmentToState(id: $id, state: "Delivered") { __typename } }`,
                { id: fulfillment.id },
                directorToken,
            );
        }
        console.log(`✔ Fulfillment ${targetState} on order ${order.id}`);
    }
}

// Real 1C-driven cancellation only exists as an ERP callback today (see
// ReservationErpSyncService.handleErpOrderStatus / ErpOrderService.updateStatus) — there is no
// manager-portal "Cancel order" button and reservation expiry never auto-cancels (see the open
// cancellation issues logged from this investigation). This mirrors that real callback so the
// demo customer has at least one order carrying erpStatus=CANCELLED, instead of pretending a
// cancellation UI exists that this app doesn't actually have.
async function topUpErpCancelledOrders(customerToken, directorToken, variantIds) {
    // Target is 1, not more: the 'unpaid' checkout plan (see checkoutOneOrder) leaves the order
    // in ArrangingPayment without finalizing it, so it stays the customer's one active order —
    // a second call in the same run would just reopen and re-cancel the same order, not create
    // a distinct second one.
    const target = 1;
    const ordersRes = await adminGql(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 200 }) { items {
            id customFields { erpStatus }
        } } } }`,
        { id: await resolveVendureCustomerId(directorToken) },
        directorToken,
    );
    const existing = ordersRes.data.customer.orders.items.filter(
        o => o.customFields.erpStatus === 'CANCELLED',
    ).length;
    const toCreate = Math.max(0, target - existing);
    console.log(`ERP-cancelled orders: ${existing} existing, creating ${toCreate} more...`);

    for (let i = 0; i < toCreate; i++) {
        const variantId = variantIds[i % variantIds.length];
        const result = await checkoutOneOrder(customerToken, [variantId], 'unpaid');
        const orderRes = await adminGql(
            `query($id: ID!) { order(id: $id) { code } }`,
            { id: result.id },
            directorToken,
        );
        const orderCode = orderRes.data.order.code;
        const res = await fetch(`${BASE_URL}/erp/callback/order-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderCode, status: 'CANCELLED', erpOrderId: `erp-${orderCode}` }),
        });
        const json = await res.json();
        console.log(`  → order ${orderCode} erp-cancelled, callback ok=${json.ok}`);
    }
}

// Places one order fully as an administrator (not the customer) — a real Vendure "sales rep
// places an order on behalf of a customer" flow via the admin draft-order mutations, settled
// with a manual/offline payment. This is the only way `ErpOrderService.onOrderPlaced`
// (packages/plugins/erp-order/src/erp-order.service.ts) resolves `placedByAdministratorId` to a
// real admin id — it reads `ctx.activeUserId` at the moment the order is placed, and every order
// checkoutOneOrder creates is placed via the customer's own shop-api session, so
// placedByAdministratorId was always null for every seeded order until now. `variantIds` can be
// 2-3 items for line-count variety (see topUpOrderVariety).
async function checkoutOneOrderAsAdmin(adminToken, customerId, variantIds) {
    const draft = await adminGql(`mutation { createDraftOrder { id } }`, undefined, adminToken);
    const orderId = draft.data.createDraftOrder.id;
    await adminGql(
        `mutation($orderId: ID!, $customerId: ID!) { setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) { __typename } }`,
        { orderId, customerId },
        adminToken,
    );
    for (const variantId of variantIds) {
        await adminGql(
            `mutation($orderId: ID!, $input: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $orderId, input: $input) { __typename } }`,
            { orderId, input: { productVariantId: variantId, quantity: 1 } },
            adminToken,
        );
    }
    await adminGql(
        `mutation($orderId: ID!) { setDraftOrderShippingAddress(orderId: $orderId, input: {
            fullName: "AutoService Nord", streetLine1: "Demo Street 1", city: "Demo City", countryCode: "RU"
        }) { __typename } }`,
        { orderId },
        adminToken,
    );
    const methodsData = await adminGql(
        `query($orderId: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $orderId) { id } }`,
        { orderId },
        adminToken,
    );
    const methodId = methodsData.data.eligibleShippingMethodsForDraftOrder[0]?.id;
    if (methodId) {
        await adminGql(
            `mutation($orderId: ID!, $id: ID!) { setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $id) { __typename } }`,
            { orderId, id: methodId },
            adminToken,
        );
    }
    await adminGql(
        `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { __typename ... on ErrorResult { errorCode message } } }`,
        { id: orderId },
        adminToken,
    );
    await adminGql(
        `mutation($orderId: ID!) { addManualPaymentToOrder(input: {
            orderId: $orderId, method: "offline-terms", transactionId: "seed-admin-placed", metadata: {}
        }) { __typename ... on ErrorResult { errorCode message } } }`,
        { orderId },
        adminToken,
    );
    return orderId;
}

// Gives the "Placed by" column real variety — a mix of the customer placing their own orders
// (checkoutOneOrder, shop-api) and a few different staff members placing orders on the
// customer's behalf (checkoutOneOrderAsAdmin, admin-api draft orders) — plus line-count variety
// (1-3 items) on the admin-placed batch, since checkoutOneOrder elsewhere is mostly called with a
// single variantId. Small fixed target, independent of the Invoice top-up target above, so it
// isn't skipped once that target is already met.
async function topUpAdminPlacedOrders(customerId, variantIds) {
    const target = 4;
    const staffLogins = [
        'ivan.operator@mivend.dev',
        'petr.manager@mivend.dev',
        'anna.portaladmin@mivend.dev',
        'nikolai.director@mivend.dev',
    ];
    const nikolaiToken = await adminLogin('nikolai.director@mivend.dev', 'Password123!');
    const ordersRes = await adminGql(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 200 }) { items {
            customFields { placedByAdministratorId }
        } } } }`,
        { id: customerId },
        nikolaiToken,
    );
    const existing = ordersRes.data.customer.orders.items.filter(o => o.customFields.placedByAdministratorId).length;
    const toCreate = Math.max(0, target - existing);
    console.log(`Admin-placed orders: ${existing} existing, creating ${toCreate} more...`);
    for (let i = 0; i < toCreate; i++) {
        const staffToken = await adminLogin(staffLogins[i % staffLogins.length], 'Password123!');
        const lineCount = 1 + (i % 3); // 1, 2, 3 items — real line-count variety
        const variants = Array.from({ length: lineCount }, (_, j) => variantIds[(i + j) % variantIds.length]);
        try {
            await checkoutOneOrderAsAdmin(staffToken, customerId, variants);
            console.log(`✔ Admin-placed order (${lineCount} lines) by ${staffLogins[i % staffLogins.length]}`);
        } catch (err) {
            console.warn(`  … admin-placed checkout failed: ${err.message}`);
        }
    }
}

// Spreads `Order.orderPlacedAt` across the last ~90 days for the demo customer's orders, purely
// for "Date placed" column variety in manual QA. There is no writable custom field or admin
// mutation for this — Vendure core sets it internally the moment an order leaves "AddingItems"
// (confirmed: no GraphQL path exists, see research before this change) — so a direct SQL UPDATE
// is the only way, same narrow spirit as AGENTS.md's "Dev seed rules" exception for data that
// structurally cannot be expressed through a real mutation. Deterministic function of order id
// against a fixed anchor date (not `NOW()`), so reruns always converge to the same values instead
// of drifting further back on every run.
function spreadOrderPlacedDates(dbContainer, dbName) {
    const sql = `UPDATE "order" SET "orderPlacedAt" = TIMESTAMP '2026-07-19' - ((id % 90) || ' days')::interval WHERE "customerId" = (SELECT id FROM customer WHERE "emailAddress" = '${CUSTOMER_EMAIL}') AND "orderPlacedAt" IS NOT NULL;`;
    console.log('Spreading orderPlacedAt dates across the last 90 days (documented raw-SQL exception, no mutation exists for this field)...');
    execSync(`docker exec ${dbContainer} psql -U postgres -d ${dbName} -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
}

// Gives the Orders tab's Reservation column real variety — RESERVED/RELEASED/EXPIRED/FAILED, not
// just NOT_REQUIRED (prepaid orders) and AWAITING_CONFIRMATION (the default nobody ever advanced).
// Uses the real reservation.resolver.ts mutations (confirmOrder/releaseOrderReservation) — no
// Order.state precondition, reservation.service.ts's reserveOrder only needs order.lines.
async function topUpReservationVariety(directorToken, customerId) {
    const targets = { RESERVED: 3, RELEASED: 3, EXPIRED: 3, FAILED: 2 };
    const ordersRes = await adminGql(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 200 }) { items {
            id customFields { reservationState } lines { id }
        } } } }`,
        { id: customerId },
        directorToken,
    );
    const items = ordersRes.data.customer.orders.items;
    const byState = items.reduce((acc, o) => {
        const s = o.customFields.reservationState;
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
    }, {});
    console.log(
        `Reservation: existing RESERVED=${byState.RESERVED ?? 0} RELEASED=${byState.RELEASED ?? 0} ` +
            `EXPIRED=${byState.EXPIRED ?? 0} FAILED=${byState.FAILED ?? 0}...`,
    );

    // AWAITING_CONFIRMATION orders with lines are the raw material for RESERVED/RELEASED/EXPIRED —
    // confirmOrder just needs order.lines populated, no Order.state precondition.
    const candidates = items.filter(o => o.customFields.reservationState === 'AWAITING_CONFIRMATION' && o.lines.length > 0);
    let idx = 0;

    const reservedToCreate = Math.max(0, targets.RESERVED - (byState.RESERVED ?? 0));
    for (let i = 0; i < reservedToCreate && idx < candidates.length; i++, idx++) {
        await adminGql(
            `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
            { orderId: candidates[idx].id, days: 14 },
            directorToken,
        );
    }

    const releasedToCreate = Math.max(0, targets.RELEASED - (byState.RELEASED ?? 0));
    const releaseTargetIds = [];
    for (let i = 0; i < releasedToCreate && idx < candidates.length; i++, idx++) {
        await adminGql(
            `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
            { orderId: candidates[idx].id, days: 14 },
            directorToken,
        );
        releaseTargetIds.push(candidates[idx].id);
    }
    for (const orderId of releaseTargetIds) {
        await adminGql(
            `mutation($orderId: ID!) { releaseOrderReservation(orderId: $orderId) }`,
            { orderId },
            directorToken,
        );
    }

    const expiredToCreate = Math.max(0, targets.EXPIRED - (byState.EXPIRED ?? 0));
    const expireTargetIds = [];
    for (let i = 0; i < expiredToCreate && idx < candidates.length; i++, idx++) {
        await adminGql(
            `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
            { orderId: candidates[idx].id, days: 1 },
            directorToken,
        );
        expireTargetIds.push(candidates[idx].id);
    }
    if (expireTargetIds.length) {
        // No manual-trigger mutation exists for ReservationExpiryWorker's sweep (unlike
        // triggerPaymentInboxSweep). expiresAt has no writable GraphQL field either — same narrow
        // documented raw-SQL exception as spreadOrderPlacedDates below. `make dev`'s worker runs
        // continuously and sweeps status='active' AND expiresAt<=NOW() on its own timer, so
        // backdating expiresAt here is enough — the worker itself flips status to 'expired' and
        // customFields.reservationState to 'EXPIRED', no need to touch either by hand.
        const idList = expireTargetIds.map(id => `'${id}'`).join(',');
        const sql = `UPDATE reservation SET "expiresAt" = NOW() - interval '1 hour' WHERE "orderId" IN (${idList}) AND status = 'active';`;
        console.log(`Backdating expiresAt for ${expireTargetIds.length} reservations so the expiry worker sweeps them...`);
        execSync(`docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }

    // FAILED needs a real stock shortage — BAT-90-AGM is seeded with stockOnHand=0
    // (infrastructure/fixtures/stock.json), so confirming any order containing it always fails.
    const failedToCreate = Math.max(0, targets.FAILED - (byState.FAILED ?? 0));
    if (failedToCreate > 0) {
        const variantRes = await adminGql(
            `query { productVariants(options: { filter: { sku: { eq: "BAT-90-AGM" } } }) { items { id } } }`,
            undefined,
            directorToken,
        );
        const zeroStockVariantId = variantRes.data.productVariants.items[0]?.id;
        if (!zeroStockVariantId) {
            console.warn('  … BAT-90-AGM variant not found, skipping FAILED reservation seeding');
        } else {
            for (let i = 0; i < failedToCreate; i++) {
                try {
                    const orderId = await checkoutOneOrderAsAdmin(directorToken, customerId, [zeroStockVariantId]);
                    await adminGql(
                        `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
                        { orderId, days: 14 },
                        directorToken,
                    );
                    console.log(`✔ FAILED reservation seeded on a new BAT-90-AGM order`);
                } catch (err) {
                    console.warn(`  … FAILED-reservation seed order failed: ${err.message}`);
                }
            }
        }
    }
}

async function main() {
    console.log('\n── Topping up CustomerDetailPage tabs for a demo customer ──\n');

    const directorToken = await adminLogin('nikolai.director@mivend.dev', 'Password123!');

    const variantsRes = await adminGql(
        `{ productVariants(options: { take: 50 }) { items { id customFields { organizationId } } } }`,
        undefined,
        directorToken,
    );
    const variantIds = variantsRes.data.productVariants.items.map(v => v.id);
    if (variantIds.length === 0) throw new Error('No seeded product variants found — run `make seed` first.');
    const variantsByOrg = {};
    for (const v of variantsRes.data.productVariants.items) {
        const orgId = v.customFields?.organizationId;
        if (orgId == null) continue;
        (variantsByOrg[orgId] ??= []).push(v.id);
    }

    const counterpartiesRes = await adminGql(
        `{ counterparties(options: { take: 100 }) { items { id erpId tradingPoints { id erpId } } } }`,
        undefined,
        directorToken,
    );
    const targetCounterparty = counterpartiesRes.data.counterparties.items.find(c => c.erpId === COUNTERPARTY_ERP_ID);
    if (!targetCounterparty) throw new Error(`Counterparty ${COUNTERPARTY_ERP_ID} not found — run \`make seed\` first.`);
    const tradingPointIds = targetCounterparty.tradingPoints.map(tp => tp.id);

    await topUpOrdersInvoicesAndPayments(directorToken, targetCounterparty.id, variantIds, variantsByOrg);
    await topUpFulfillmentVariety(directorToken, await resolveVendureCustomerId(directorToken));
    await topUpErpCancelledOrders(await shopLogin(CUSTOMER_EMAIL, CUSTOMER_PASSWORD), directorToken, variantIds);
    await topUpAdminPlacedOrders(await resolveVendureCustomerId(directorToken), variantIds);
    spreadOrderPlacedDates('docker-postgres-central-1', 'mivend_central');
    await topUpReservationVariety(directorToken, await resolveVendureCustomerId(directorToken));
    await topUpDocuments();
    await topUpHistory(directorToken, tradingPointIds);

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
