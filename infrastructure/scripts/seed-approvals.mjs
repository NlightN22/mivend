// Seeds real ApprovalRequest rows (discount grants, price adjustments, credit-term extensions)
// across a spread of statuses (pending / approved / rejected), so the manager portal's
// /approvals inbox and /discounts "Pending / rejected requests" section have something to show
// on a fresh `make seed` run — previously only e2e's global-setup.ts ever created any of these,
// so a plain dev seed left the inbox permanently empty.
//
// ApprovalRequest is a real business-workflow state machine, not ERP master data — it cannot be
// expressed as an erp-import record type (see AGENTS.md "Dev seed rules" exception clause).
// Goes through the real Admin GraphQL mutations instead (same pattern as
// packages/e2e/global-setup.ts and this script's own seed-access-roles.mjs), so every request
// created here is exactly as real/valid as one a manager would create by hand.
//
// Run: node infrastructure/scripts/seed-approvals.mjs
// Requires: server running, `make seed-access-roles` + `make seed` already run (needs the six
// manager-portal roles, the demo administrators, and counterparty cnt-001 to exist).

const API_URL = `http://localhost:${process.env.PORT ?? '3000'}/admin-api`;

async function gql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken };
}

async function login(username, password) {
    const { data, authToken } = await gql(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}`,
        { u: username, p: password },
    );
    if (!authToken) throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
    return authToken;
}

// The manager-portal role chains actually implemented (see docs/access-control.md layer 5 and
// CreditTermGateService/PriceAdjustmentGateService) — not the older, more elaborate multi-
// department-head chain sketched in docs/ai/manager-portal-concept.md §4.1, which predates the
// real 6-role model this codebase settled on.
const WORKFLOWS = [
    {
        requestType: 'discountGrantApproval',
        displayName: 'Discount grant approval',
        steps: [
            { order: 0, role: 'department-head', requiredPermission: 'ApproveDiscountRequest', escalatesTo: ['general-director'] },
        ],
    },
    {
        requestType: 'priceAdjustmentApproval',
        displayName: 'Price adjustment approval',
        steps: [
            { order: 0, role: 'department-head', requiredPermission: 'ApproveDiscountRequest', escalatesTo: ['general-director'] },
        ],
    },
    {
        requestType: 'creditTermApproval',
        displayName: 'Credit term extension (within limit)',
        steps: [
            { order: 0, role: 'department-head', requiredPermission: 'ApproveDiscountRequest', escalatesTo: [] },
        ],
    },
    {
        requestType: 'creditTermApprovalEscalated',
        displayName: 'Credit term extension (escalated)',
        steps: [
            { order: 0, role: 'security-officer', requiredPermission: 'ApproveSecurityLimit', escalatesTo: [] },
            { order: 1, role: 'general-director', requiredPermission: 'ApproveSecurityLimit', escalatesTo: [] },
        ],
    },
];

async function seedWorkflowDefinitions(superToken) {
    for (const wf of WORKFLOWS) {
        await gql(
            `mutation($requestType: String!, $displayName: String!, $steps: [WorkflowStepInput!]!) {
                upsertWorkflowDefinition(requestType: $requestType, displayName: $displayName, steps: $steps) { requestType }
            }`,
            wf,
            superToken,
        );
        console.log(`✔ Workflow definition "${wf.requestType}"`);
    }
}

async function createDraftOrderLine(token, customerId, variantId) {
    const draft = await gql(`mutation { createDraftOrder { id } }`, undefined, token);
    const orderId = draft.data.createDraftOrder.id;
    await gql(
        `mutation($orderId: ID!, $customerId: ID!) {
            setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) { __typename }
        }`,
        { orderId, customerId },
        token,
    );
    const added = await gql(
        `mutation($orderId: ID!, $input: AddItemToDraftOrderInput!) {
            addItemToDraftOrder(orderId: $orderId, input: $input) {
                __typename
                ... on Order { lines { id } }
            }
        }`,
        { orderId, input: { productVariantId: variantId, quantity: 1 } },
        token,
    );
    const lines = added.data.addItemToDraftOrder.lines;
    return { orderId, orderLineId: lines[lines.length - 1].id };
}

async function main() {
    console.log('\n── Seeding manager-portal approval requests ──\n');

    const superToken = await login('superadmin', 'superadmin');
    await seedWorkflowDefinitions(superToken);

    const directorToken = await login('nikolai.director@mivend.dev', 'Password123!');
    const managerToken = await login('petr.manager@mivend.dev', 'Password123!');
    const deptHeadToken = await login('olga.depthead@mivend.dev', 'Password123!');
    const securityToken = await login('svetlana.security@mivend.dev', 'Password123!');

    // department-head can approve credit-term extensions up to 14 days on their own authority;
    // beyond that, the request escalates (see CreditTermGateService) — set once here so both
    // the within-limit and escalated demo requests below actually exercise different chains.
    await gql(
        `mutation($roleCode: String!, $maxExtraDays: Int!) {
            setCreditTermLimit(roleCode: $roleCode, maxExtraDays: $maxExtraDays) { roleCode }
        }`,
        { roleCode: 'department-head', maxExtraDays: 14 },
        directorToken,
    );
    console.log('✔ Credit-term limit for department-head: 14 days');

    const customersRes = await gql(
        `{ customers(options: { take: 100 }) { items { id emailAddress } } }`,
        undefined,
        directorToken,
    );
    const customer = customersRes.data.customers.items.find(
        c => c.emailAddress === 'ivan@autoservice-nord.example',
    );
    if (!customer) throw new Error('Seeded customer ivan@autoservice-nord.example not found — run `make seed` first.');

    const counterpartiesRes = await gql(
        `{ counterparties(options: { take: 100 }) { items { id erpId } } }`,
        undefined,
        directorToken,
    );
    const counterparty = counterpartiesRes.data.counterparties.items.find(c => c.erpId === 'cnt-001');
    if (!counterparty) throw new Error('Seeded counterparty cnt-001 not found — run `make seed` first.');

    const variantsRes = await gql(
        `{ productVariants(options: { take: 1 }) { items { id sku } } }`,
        undefined,
        directorToken,
    );
    const variant = variantsRes.data.productVariants.items[0];
    if (!variant) throw new Error('No seeded product variants found — run `make seed` first.');

    const validFrom = new Date().toISOString();
    const validTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // --- discountGrantApproval: one approved, one rejected, one left pending ---
    async function requestDiscountGrant(percent, justification) {
        const res = await gql(
            `mutation($input: DiscountGrantInput!) { requestDiscountGrant(input: $input) { id } }`,
            {
                input: {
                    priceTypeCode: 'WHOLESALE',
                    percent,
                    validFrom,
                    validTo,
                    justification,
                    counterpartyIds: [counterparty.id],
                },
            },
            managerToken,
        );
        return res.data.requestDiscountGrant.id;
    }
    const grantApproved = await requestDiscountGrant(15, 'Loyal customer, consistent volume for 2 years');
    await gql(
        `mutation($requestId: ID!) { decideDiscountGrantRequest(requestId: $requestId, decision: "approved") { id } }`,
        { requestId: grantApproved },
        deptHeadToken,
    );
    console.log('✔ discountGrantApproval: 1 approved');

    const grantRejected = await requestDiscountGrant(40, 'Customer is threatening to switch to a competitor');
    await gql(
        `mutation($requestId: ID!) { decideDiscountGrantRequest(requestId: $requestId, decision: "rejected", comment: "Margin impact too high for this price type") { id } }`,
        { requestId: grantRejected },
        deptHeadToken,
    );
    console.log('✔ discountGrantApproval: 1 rejected');

    await requestDiscountGrant(10, 'New volume tier, first order over 500kg');
    console.log('✔ discountGrantApproval: 1 pending');

    // --- priceAdjustmentApproval: one approved, one left pending ---
    // No FLOOR price type is seeded by `make seed`, so PriceAdjustmentGateService's
    // "no floor configured -> requires-approval" conservative default means every adjustment
    // below always goes through the approval workflow, regardless of the requested price.
    async function requestPriceAdjustment(justification) {
        const { orderId, orderLineId } = await createDraftOrderLine(directorToken, customer.id, variant.id);
        const res = await gql(
            `mutation($orderId: ID!, $orderLineId: ID!, $requestedPrice: Int!, $justification: String) {
                requestPriceAdjustment(orderId: $orderId, orderLineId: $orderLineId, requestedPrice: $requestedPrice, justification: $justification) {
                    approvalRequestId
                }
            }`,
            { orderId, orderLineId, requestedPrice: 100, justification },
            managerToken,
        );
        return res.data.requestPriceAdjustment.approvalRequestId;
    }
    const adjustmentApproved = await requestPriceAdjustment('Competitor is offering this SKU at a lower price locally');
    await gql(
        `mutation($requestId: ID!) { decidePriceAdjustmentRequest(requestId: $requestId, decision: "approved") { id } }`,
        { requestId: adjustmentApproved },
        deptHeadToken,
    );
    console.log('✔ priceAdjustmentApproval: 1 approved');

    await requestPriceAdjustment('One-off deal to close a large order this week');
    console.log('✔ priceAdjustmentApproval: 1 pending');

    // --- creditTermApproval (within limit) + creditTermApprovalEscalated (exceeds limit) ---
    const withinLimit = await gql(
        `mutation($input: CreditTermRequestInput!) { requestCreditTermExtension(input: $input) { id requestType } }`,
        { input: { counterpartyErpId: 'cnt-001', requestedExtraDays: 7, justification: 'Temporary cash-flow gap, resolves next quarter' } },
        managerToken,
    );
    await gql(
        `mutation($requestId: ID!) { decideCreditTermRequest(requestId: $requestId, decision: "approved") { id } }`,
        { requestId: withinLimit.data.requestCreditTermExtension.id },
        deptHeadToken,
    );
    console.log('✔ creditTermApproval (within limit): 1 approved');

    const escalatedInProgress = await gql(
        `mutation($input: CreditTermRequestInput!) { requestCreditTermExtension(input: $input) { id requestType } }`,
        { input: { counterpartyErpId: 'cnt-001', requestedExtraDays: 30, justification: 'Customer requests extended terms for a seasonal restock order' } },
        managerToken,
    );
    await gql(
        `mutation($requestId: ID!) { decideCreditTermRequest(requestId: $requestId, decision: "approved") { id } }`,
        { requestId: escalatedInProgress.data.requestCreditTermExtension.id },
        securityToken,
    );
    console.log('✔ creditTermApprovalEscalated: step 1 approved, awaiting general-director (step 2 pending)');

    const escalatedRejected = await gql(
        `mutation($input: CreditTermRequestInput!) { requestCreditTermExtension(input: $input) { id requestType } }`,
        { input: { counterpartyErpId: 'cnt-001', requestedExtraDays: 45, justification: 'Customer wants to defer payment for a bulk seasonal order' } },
        managerToken,
    );
    await gql(
        `mutation($requestId: ID!) { decideCreditTermRequest(requestId: $requestId, decision: "rejected", comment: "Existing balance already near the credit limit") { id } }`,
        { requestId: escalatedRejected.data.requestCreditTermExtension.id },
        securityToken,
    );
    console.log('✔ creditTermApprovalEscalated: rejected at step 1');

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
