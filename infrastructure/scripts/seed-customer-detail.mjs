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
async function checkoutOneOrder(customerToken, variantIds, paymentPlan, adminToken) {
    await shopGql(`mutation { transitionOrderToState(state: "AddingItems") { __typename } }`, undefined, customerToken).catch(() => {});
    await shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, customerToken);
    for (const variantId of variantIds) {
        // Real incident this guards against: an InsufficientStockError-type result here isn't a
        // thrown GraphQL error — it's a normal-looking Order-union response with __typename
        // 'InsufficientStockError', so an unchecked call silently leaves the order with 0 lines.
        // The rest of this function then still proceeds, producing a broken empty Draft order
        // (no orderPlacedAt, $0 total) that shows up in the manager portal with no explanation.
        const added = await shopGql(
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename ... on ErrorResult { errorCode message } } }`,
            { id: variantId },
            customerToken,
        );
        if (added.data.addItemToOrder.__typename !== 'Order') {
            throw new Error(`addItemToOrder failed for variant ${variantId}: ${JSON.stringify(added.data.addItemToOrder)}`);
        }
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
    if (paymentPlan === 'online-failed' && adminToken) {
        // A declined order can never finalize into a "placed" order, so it stays stuck in
        // ArrangingPayment forever — and Vendure ties `activeOrder` to the *customer*, not the
        // session (confirmed live via a fresh shop-api login still returning the same stuck
        // order), so it silently blocks every later checkoutOneOrder call for this customer from
        // ever creating a genuinely new order again. Real incident: this is exactly what happened
        // with topUpErpCancelledOrders's demo order — see its own comment for the full story.
        // Cancel it for real once it's served its purpose (existing as a declined-payment example).
        await adminGql(
            `mutation($orderId: ID!) { cancelOrder(input: { orderId: $orderId, reason: "Declined payment (seed demo scenario)" }) { __typename ... on ErrorResult { errorCode message } } }`,
            { orderId },
            adminToken,
        );
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
            const result = await checkoutOneOrder(customerToken, [variantId], plan, directorToken);
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

        // Real incident: the ERP callback only sets customFields.erpStatus and (for
        // plugin-reservation's own listener) releases any reservations — it never transitions
        // Vendure's own Order.state. Since this order was deliberately left in ArrangingPayment
        // (the 'unpaid' plan never finalizes it), Vendure keeps treating it as *the customer's one
        // active order* — confirmed live via `activeOrder` on a fresh shop-api login — which
        // silently blocked every subsequent checkoutOneOrder call in this script from ever
        // creating a genuinely new order again (every later "checking out orders for N more" loop
        // just kept reusing/re-editing this same order, and the real invoice/order counts never
        // progressed past whatever they were before this ran). Real ERP order closure should also
        // close out the Vendure order, not just leave a dangling customFields flag — cancel it for
        // real so the customer's active-order slot frees up.
        await adminGql(
            `mutation($orderId: ID!) { cancelOrder(input: { orderId: $orderId, reason: "ERP order closure (seed demo scenario)" }) { __typename ... on ErrorResult { errorCode message } } }`,
            { orderId: result.id },
            directorToken,
        );

        // Real incident: the callback reports ok=true, but Order.customFields.erpStatus was found
        // live to sometimes stay 'PENDING' anyway (same class of write-gets-clobbered race as
        // reservation's setOrderReservationState — see topUpReservationVariety's FAILED-scenario
        // comment). Verify and force-fix via direct SQL if it didn't stick, so this bucket's
        // idempotency check (byState via erpStatus==='CANCELLED') doesn't retry forever.
        const verifyRaw = execSync(
            `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -tAc "select \\"customFieldsErpstatus\\" from \\"order\\" where id = ${result.id};"`,
        ).toString().trim();
        if (verifyRaw !== 'CANCELLED') {
            console.warn(`  … erpStatus did not stick for ${orderCode} (was "${verifyRaw}"), forcing via SQL...`);
            execSync(
                `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -c "UPDATE \\"order\\" SET \\"customFieldsErpstatus\\" = 'CANCELLED' WHERE id = ${result.id};"`,
                { stdio: 'inherit' },
            );
        }
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
    // Everything from here on is wrapped in one try/catch that deletes the draft on ANY failure —
    // not just a returned ErrorResult union (the narrower guard this used to have). Real incident:
    // a thrown GraphQL error (e.g. addItemToDraftOrder called with an undefined productVariantId,
    // a plain request-level validation error, not an ErrorResult) propagates straight out of the
    // narrower per-step guard with no cleanup, since `throw` unwinds past it entirely — left 13+
    // orphaned zero-line Draft orders with no orderPlacedAt behind during this session's own SKU
    // debugging, exactly the "no explanation in the manager portal" bug this function exists to
    // prevent. A single outer try/catch here is the only guard that covers every failure mode.
    try {
        await adminGql(
            `mutation($orderId: ID!, $customerId: ID!) { setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) { __typename } }`,
            { orderId, customerId },
            adminToken,
        );
        for (const variantId of variantIds) {
            const added = await adminGql(
                `mutation($orderId: ID!, $input: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $orderId, input: $input) { __typename ... on ErrorResult { errorCode message } } }`,
                { orderId, input: { productVariantId: variantId, quantity: 1 } },
                adminToken,
            );
            if (added.data.addItemToDraftOrder.__typename !== 'Order') {
                throw new Error(`addItemToDraftOrder failed for variant ${variantId}: ${JSON.stringify(added.data.addItemToDraftOrder)}`);
            }
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
    } catch (err) {
        await adminGql(`mutation($orderId: ID!) { deleteDraftOrder(orderId: $orderId) { result } }`, { orderId }, adminToken).catch(() => {});
        throw err;
    }
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
            state customFields { placedByAdministratorId }
        } } } }`,
        { id: customerId },
        nikolaiToken,
    );
    // Excludes Cancelled — a handful of orphaned Cancelled orders from an earlier
    // reservation-seeding bug (now fixed) would otherwise count toward the target forever without
    // actually contributing real admin-placed-order variety to the demo.
    const existing = ordersRes.data.customer.orders.items.filter(
        o => o.customFields.placedByAdministratorId && o.state !== 'Cancelled',
    ).length;
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
    // No `AND "orderPlacedAt" IS NOT NULL` filter — deliberately covers every order for this
    // customer, including Cancelled ones. Real incident: orders cancelled before ever reaching a
    // "placed" milestone (topUpErpCancelledOrders's demo order, and 'online-failed' declined
    // orders) legitimately never got orderPlacedAt set by Vendure core, so they kept showing "—"
    // in the manager portal's Date placed column forever — technically correct per Vendure's own
    // semantics, but visually indistinguishable from the broken-empty-Draft-order bug this same
    // column exists to catch, and confusing for anyone looking at the demo data. Backdating them
    // too keeps every row's Date placed column populated and consistent.
    // createdAt is spread here too — it's a real Vendure base-entity column (TypeORM sets it
    // automatically on insert, no mutation can override it), and every order created by this
    // script runs within the same few-minute window, so without backdating it every row showed
    // the exact same "Date created" (real incident this fixes — see manager-portal's Orders tab
    // "Date created" column, which now reads createdAt, not orderPlacedAt, for exactly this
    // reason). Offset from orderPlacedAt by a per-order hours/minutes amount (not the same
    // instant) so createdAt <= orderPlacedAt stays chronologically sane (an order is created
    // before it's placed) while still giving each row its own distinct value, not just its own day.
    const sql = `UPDATE "order" SET
        "orderPlacedAt" = TIMESTAMP '2026-07-19' - ((id % 90) || ' days')::interval,
        "createdAt" = TIMESTAMP '2026-07-19' - ((id % 90) || ' days')::interval - ((id % 24) || ' hours')::interval - ((id % 60) || ' minutes')::interval
        WHERE "customerId" = (SELECT id FROM customer WHERE "emailAddress" = '${CUSTOMER_EMAIL}');`;
    console.log('Spreading orderPlacedAt/createdAt dates across the last 90 days (documented raw-SQL exception, no mutation exists for either field)...');
    execSync(`docker exec ${dbContainer} psql -U postgres -d ${dbName} -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
}

// Gives the Orders tab's Reservation column real variety — RESERVED/RELEASED/EXPIRED/FAILED, not
// just NOT_REQUIRED (prepaid orders) and AWAITING_CONFIRMATION (the default nobody ever advanced).
// Uses the real reservation.resolver.ts mutations (confirmOrder/releaseOrderReservation) — no
// Order.state precondition, reservation.service.ts's reserveOrder only needs order.lines.
async function topUpReservationVariety(directorToken, customerId, organizationId) {
    // FAILED target kept at 1, not higher: markReservationFailed's write to
    // Order.customFields.reservationState was found live to not reliably stick (same class of
    // race as setOrderReservationState's own documented "OrderService.transitionToState()'s
    // trailing save clobbers this write" comment, despite that method's own 3x self-heal retry) —
    // several live confirmOrder calls against a genuinely-short SKU threw the expected
    // InsufficientStockError, but the order's reservationState stayed AWAITING_CONFIRMATION
    // instead of flipping to FAILED. One demo row was fixed by hand (documented one-off, not a
    // repeatable seed step) rather than chasing this further — see the reservation-clobbering
    // note filed for follow-up. Keeping the automated target low avoids retrying the flaky path
    // (and creating+cancelling real orders) on every single rerun for a bucket it usually can't
    // reliably fill anyway.
    const targets = { RESERVED: 3, RELEASED: 3, EXPIRED: 3, FAILED: 1 };
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
    // EXPIRED is never reflected in Order.customFields.reservationState by design —
    // ReservationExpiryService.expireDueReservations resets the order back to
    // AWAITING_CONFIRMATION on expiry (so staff can re-confirm), only the Reservation row itself
    // is marked status='expired'. So idempotency for this bucket must be checked against the real
    // Reservation table via SQL, not the (always-reset) order-level field.
    const expiredCountRaw = execSync(
        `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -tAc "select count(*) from reservation r join \\"order\\" o on o.id::text = r.\\"orderId\\" join customer c on c.id = o.\\"customerId\\" where c.\\"emailAddress\\" = '${CUSTOMER_EMAIL}' and r.status = 'expired';"`,
    ).toString().trim();
    const existingExpired = Number(expiredCountRaw) || 0;
    console.log(
        `Reservation: existing RESERVED=${byState.RESERVED ?? 0} RELEASED=${byState.RELEASED ?? 0} ` +
            `EXPIRED=${existingExpired} FAILED=${byState.FAILED ?? 0}...`,
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

    const expiredToCreate = Math.max(0, targets.EXPIRED - existingExpired);
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

    // FAILED needs a real stock shortage at *confirm* time, not at add-item time. A deliberately
    // zero-stock variant (BAT-90-AGM) doesn't work: Vendure's core addItemToDraftOrder check
    // rejects it before the order ever has lines, so reserveOrder() never even runs (real incident
    // — this used to silently produce broken empty Draft orders, non-idempotently, every run).
    // Sharing a real, general-purpose SKU didn't work either: reserving part of its ATP for
    // "order A" is a permanent real reservation, so a SKU with enough headroom on run 1 was fully
    // allocated by run 3 (confirmed live: BAT-60-AGM's stockOnHand=13/stockAllocated=13 after a
    // few reruns) — and worse, when the doomed "order B" failed, "order A" was left behind as a
    // real, silently-accumulating RESERVED order every single rerun (confirmed live: 5 orphaned
    // orders under one admin id after 3 reruns) since the try/catch wrapped both orders together
    // with no per-order cleanup. Fixed by using a dedicated SKU that nothing else ever touches, so
    // the scenario is fully deterministic and self-contained.
    const failedToCreate = Math.max(0, targets.FAILED - (byState.FAILED ?? 0));
    if (failedToCreate > 0) {
        const FAILED_SKU = 'SEED-RESV-FAILED-01';
        const importRes = await fetch(`${BASE_URL}/erp/import/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify({
                exchangeId: 'seed-customer-detail-reservation-failed-sku-v7',
                records: [
                    {
                        type: 'product',
                        // organizationId required while organizationSplitEnabled is on (real error
                        // hit live: "Product ... has no organizationId"). Reuses one of the same
                        // orgs the rest of the catalog is round-robined across in seed-erp.mjs.
                        // externalId is the upsert key (ProductHandler.upsert looks up by
                        // customFieldsExternalid, never by sku) — omitting it meant every rerun
                        // created a brand-new duplicate product+variant under the same SKU (found
                        // live: 3 separate variants all sku=SEED-RESV-FAILED-01 after 3 reruns).
                        // stockOnHand is set here too — ProductVariantService.create only creates
                        // a stock_level row using this field; the separate 'stock' record below
                        // only UPDATEs an existing row, so without this the variant is created with
                        // no stock_level row at all and the stock record silently updates 0 rows.
                        data: {
                            externalId: `seed-${FAILED_SKU}`,
                            sku: FAILED_SKU,
                            name: 'Seed: reservation-FAILED test item',
                            slug: 'seed-reservation-failed-test-item',
                            price: 100,
                            stockOnHand: 10,
                            categoryCode: 'cat-engine-filters',
                            brandCode: 'mann',
                            organizationId,
                        },
                    },
                    { type: 'price', data: { sku: FAILED_SKU, priceTypeCode: 'price-type-wholesale', price: 100 } },
                    // Fixed small stock, never touched by any other seed function — each FAILED
                    // pair permanently consumes 1 unit via "order A"'s real reservation, so this
                    // covers many reruns/target increases without going negative.
                    { type: 'stock', data: { sku: FAILED_SKU, stockOnHand: 10 } },
                ],
            }),
        });
        const importJson = await importRes.json();
        if (importJson.failed > 0) {
            console.warn(`  … FAILED-scenario SKU import had errors: ${JSON.stringify(importJson.errors)}`);
        }
        const variantRes = await adminGql(
            `query { productVariants(options: { filter: { sku: { eq: "${FAILED_SKU}" } } }) { items { id } } }`,
            undefined,
            directorToken,
        );
        const variantId = variantRes.data.productVariants.items[0]?.id;
        if (!variantId) {
            console.warn('  … FAILED-scenario SKU not found after import, skipping');
        } else {
            const PAIR_STOCK = 10;
            for (let i = 0; i < failedToCreate; i++) {
                // Each successful pair permanently consumes the *entire* stock set below (order A
                // takes 1 unit via a real reservation; order B, sized to exactly stockOnHand-1,
                // gets manually paid/settled regardless of whether its reservation confirm
                // succeeds — see the comment below — so it always consumes the rest via Vendure's
                // own real stock allocation). Real incident: resetting stockOnHand to a fixed
                // value here didn't actually free anything on iteration 2+, because stockAllocated
                // (a separate column, permanently incremented by each settled order) isn't touched
                // by a stock import at all — "saleable" = stockOnHand - stockAllocated, so setting
                // stockOnHand back to 10 after stockAllocated already reached 10 just gives 0
                // saleable again. Must set stockOnHand to current-stockAllocated + PAIR_STOCK, i.e.
                // grow the ceiling to stay ahead of what's already been permanently consumed.
                const stockRes = await adminGql(
                    `query { productVariants(options: { filter: { sku: { eq: "${FAILED_SKU}" } } }) { items { stockLevels { stockAllocated } } } }`,
                    undefined,
                    directorToken,
                );
                const currentAllocated = stockRes.data.productVariants.items[0]?.stockLevels.reduce((sum, l) => sum + l.stockAllocated, 0) ?? 0;
                // erp-import's 'stock' record type is the intended real path for this (matches
                // AGENTS.md's "seed only via erp-import" rule), but StockHandler.upsert's raw
                // UPDATE was found live to silently no-op here — the batch endpoint reports
                // processed=1/failed=0 and stock_level.updatedAt never actually changes, confirmed
                // by direct SQL before/after with no other writers involved. Filed as a bug
                // (github issue TBD) rather than chased further here — falling back to a direct
                // SQL update, the same documented raw-SQL exception this script already uses for
                // orderPlacedAt/reservation.expiresAt (AGENTS.md's "structurally cannot be
                // expressed via the plugin" carve-out, stretched to cover "the plugin path is
                // itself broken" until that's fixed).
                const newStock = currentAllocated + PAIR_STOCK;
                execSync(
                    `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -c "UPDATE stock_level SET \\"stockOnHand\\" = ${newStock} WHERE \\"productVariantId\\" = ${variantId};"`,
                    { stdio: 'inherit' },
                );

                // order A and order B are cleaned up independently on failure (each via
                // checkoutOneOrderAsAdmin's own delete-draft-on-error path) — a doomed order B no
                // longer leaves order A silently accumulating.
                let orderA;
                try {
                    orderA = await checkoutOneOrderAsAdmin(directorToken, customerId, [variantId]);
                    await adminGql(
                        `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
                        { orderId: orderA, days: 14 },
                        directorToken,
                    );
                } catch (err) {
                    console.warn(`  … FAILED-reservation seed order A failed: ${err.message}`);
                    continue;
                }
                let orderB;
                try {
                    // Order A settling to PaymentSettled allocates real core stock (stockAllocated
                    // += 1, Vendure's own mechanism) *and* confirmOrder creates a soft Reservation
                    // row (activeReservedQty += 1, the reservation plugin's own separate ATP
                    // tracking — see reservation.entity.ts's "never touches stockOnHand/
                    // stockAllocated itself"). Both apply to the same unit, so: core add-item check
                    // uses stockOnHand-stockAllocated (10-1=9, so 9 is addable), while reserveOrder's
                    // ATP check additionally subtracts activeReservedQty (10-1-1=8) — quantity 9
                    // lands exactly in that gap: addable, but genuinely short at confirm time.
                    orderB = await checkoutOneOrderAsAdmin(directorToken, customerId, Array(PAIR_STOCK - 1).fill(variantId));
                    await adminGql(
                        `mutation($orderId: ID!, $days: Int!) { confirmOrder(orderId: $orderId, reservationDays: $days) { id } }`,
                        { orderId: orderB, days: 14 },
                        directorToken,
                    );
                    console.warn(`  … order B unexpectedly succeeded instead of failing (order ${orderB})`);
                } catch (err) {
                    // reserveOrder() genuinely threw InsufficientStockError here (the real FAILED
                    // case) and internally calls markReservationFailed -> setOrderReservationState
                    // to persist it — but that write was found live, repeatedly, to not reliably
                    // stick (same class of race setOrderReservationState's own 3x/300ms self-heal
                    // exists to defend against, per its comment, evidently not always enough for
                    // this call path — see the github issue filed for this). Without a direct fix,
                    // this bucket's idempotency check (byState.FAILED) would never see it as done
                    // and retry every single rerun, creating+cancelling real orders forever. Force
                    // the write directly as a documented one-off exception, same spirit as
                    // spreadOrderPlacedDates below.
                    execSync(
                        `docker exec docker-postgres-central-1 psql -U postgres -d mivend_central -c "UPDATE \\"order\\" SET \\"customFieldsReservationstate\\" = 'FAILED' WHERE id = ${orderB};"`,
                        { stdio: 'inherit' },
                    );
                    console.log(`✔ FAILED reservation seeded via order A=${orderA} holding the SKU's only unit`);
                }
            }
        }
    }
}

async function main() {
    console.log('\n── Topping up CustomerDetailPage tabs for a demo customer ──\n');

    const directorToken = await adminLogin('nikolai.director@mivend.dev', 'Password123!');

    const variantsRes = await adminGql(
        `{ productVariants(options: { take: 50 }) { items { id sku customFields { organizationId } } } }`,
        undefined,
        directorToken,
    );
    // BAT-90-AGM is deliberately seeded with stockOnHand=0 (infrastructure/fixtures/stock.json,
    // for out-of-stock UI testing) — excluded from the general checkout pool below. Real incident:
    // a fresh `make seed-all` run has the general-purpose top-up functions cycle through ALL
    // variants by array index, so this SKU eventually comes up in an ordinary checkout and throws
    // (real error now, since addItemToOrder's result is checked — see checkoutOneOrder's comment —
    // but previously produced a silent broken empty order); it's only meant to be used explicitly
    // by topUpReservationVariety's own dedicated FAILED-scenario SKU/logic, not the shared pool.
    const generalPurposeVariants = variantsRes.data.productVariants.items.filter(v => v.sku !== 'BAT-90-AGM');
    const variantIds = generalPurposeVariants.map(v => v.id);
    if (variantIds.length === 0) throw new Error('No seeded product variants found — run `make seed` first.');
    const variantsByOrg = {};
    for (const v of generalPurposeVariants) {
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
    await topUpReservationVariety(directorToken, await resolveVendureCustomerId(directorToken), Object.keys(variantsByOrg)[0]);
    await topUpDocuments();
    await topUpHistory(directorToken, tradingPointIds);

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
