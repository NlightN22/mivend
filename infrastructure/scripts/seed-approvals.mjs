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

// Per-request-type idempotency: fetch existing requests' justification text (part of the JSON
// payload) and skip creating any scenario whose justification already exists. No dedicated dedup
// key on ApprovalRequest — the justification string doubles as one, since each seed scenario below
// uses a unique, descriptive justification by design.
async function existingJustifications(token, requestType) {
    const res = await gql(
        `query($requestType: String!, $options: ApprovalListOptions) {
            approvalRequestsByType(requestType: $requestType, options: $options) { items { payload } }
        }`,
        { requestType, options: { take: 200 } },
        token,
    );
    const set = new Set();
    for (const item of res.data.approvalRequestsByType.items) {
        try {
            const justification = JSON.parse(item.payload).justification;
            if (justification) set.add(justification);
        } catch {
            // malformed payload — ignore, treat as not-seeded
        }
    }
    return set;
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
    const counterpartyByErpId = new Map(
        counterpartiesRes.data.counterparties.items.map(c => [c.erpId, c.id]),
    );
    if (!counterpartyByErpId.has('cnt-001')) {
        throw new Error('Seeded counterparty cnt-001 not found — run `make seed` first.');
    }

    const variantsRes = await gql(
        `{ productVariants(options: { take: 1 }) { items { id sku } } }`,
        undefined,
        directorToken,
    );
    const variant = variantsRes.data.productVariants.items[0];
    if (!variant) throw new Error('No seeded product variants found — run `make seed` first.');

    const validFrom = new Date().toISOString();
    const validTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // --- discountGrantApproval: varied counterparties, percentages, decisions ---
    // cnt-001 gets several *approved* grants with different facet scope and validTo distance —
    // each approved request materializes into a real DiscountGrant, which is what
    // CustomerDetailPage's Discounts tab (discountGrantsForCounterparty) actually lists, so
    // "5 approved grants for cnt-001" is what makes that tab show 5 rows, not just 5 requests.
    const discountGrantScenarios = [
        { counterpartyErpId: 'cnt-001', percent: 15, justification: 'Loyal customer, consistent volume for 2 years', decision: 'approved' },
        { counterpartyErpId: 'cnt-001', percent: 12, facetCode: 'brand', facetValueCode: 'castrol', validToDays: 10, justification: 'Castrol volume tier renewal, expiring soon for visibility', decision: 'approved' },
        { counterpartyErpId: 'cnt-001', percent: 18, facetCode: 'brand', facetValueCode: 'brembo', validToDays: -5, justification: 'Brembo campaign discount from last quarter, now expired', decision: 'approved' },
        { counterpartyErpId: 'cnt-001', percent: 8, facetCode: 'brand', facetValueCode: 'ngk', validToDays: 180, justification: 'NGK long-term partnership discount', decision: 'approved' },
        { counterpartyErpId: 'cnt-001', percent: 20, validToDays: 45, justification: 'Renewal of the prior all-products discount at a higher tier', decision: 'approved' },
        { counterpartyErpId: 'cnt-001', percent: 40, justification: 'Customer is threatening to switch to a competitor', decision: 'rejected', comment: 'Margin impact too high for this price type' },
        { counterpartyErpId: 'cnt-001', percent: 10, justification: 'New volume tier, first order over 500kg', decision: null },
        { counterpartyErpId: 'cnt-002', percent: 12, justification: 'Retail partner requesting matching regional discount', decision: 'approved' },
        { counterpartyErpId: 'cnt-003', percent: 8, justification: 'First bulk order from a new garage chain', decision: null },
        { counterpartyErpId: 'cnt-004', percent: 20, justification: 'Annual contract renewal with volume commitment', decision: 'approved' },
        { counterpartyErpId: 'cnt-005', percent: 25, justification: 'One-off clearance deal for slow-moving stock', decision: 'rejected', comment: 'Percent exceeds category margin floor' },
        { counterpartyErpId: 'cnt-006', percent: 10, justification: 'Seasonal promotion for winter tyre-related parts', decision: null },
        { counterpartyErpId: 'cnt-007', percent: 15, justification: 'Referral bonus for bringing in a new counterparty', decision: 'approved' },
        { counterpartyErpId: 'cnt-008', percent: 18, justification: 'Compensation for a delayed prior shipment', decision: null },
    ];
    const existingGrantJustifications = await existingJustifications(directorToken, 'discountGrantApproval');
    for (const s of discountGrantScenarios) {
        if (existingGrantJustifications.has(s.justification)) continue;
        const scenarioValidTo = s.validToDays != null
            ? new Date(Date.now() + s.validToDays * 24 * 60 * 60 * 1000).toISOString()
            : validTo;
        const res = await gql(
            `mutation($input: DiscountGrantInput!) { requestDiscountGrant(input: $input) { id } }`,
            {
                input: {
                    priceTypeCode: 'WHOLESALE',
                    percent: s.percent,
                    facetCode: s.facetCode ?? null,
                    facetValueCode: s.facetValueCode ?? null,
                    validFrom,
                    validTo: scenarioValidTo,
                    justification: s.justification,
                    counterpartyIds: [counterpartyByErpId.get(s.counterpartyErpId)],
                },
            },
            managerToken,
        );
        const requestId = res.data.requestDiscountGrant.id;
        if (s.decision) {
            await gql(
                `mutation($requestId: ID!, $decision: String!, $comment: String) { decideDiscountGrantRequest(requestId: $requestId, decision: $decision, comment: $comment) { id } }`,
                { requestId, decision: s.decision, comment: s.comment ?? null },
                deptHeadToken,
            );
        }
        console.log(`✔ discountGrantApproval: ${s.decision ?? 'pending'} (${s.counterpartyErpId})`);
    }

    // --- priceAdjustmentApproval: varied justifications, real draft orders ---
    // No FLOOR price type is seeded by `make seed`, so PriceAdjustmentGateService's
    // "no floor configured -> requires-approval" conservative default means every adjustment
    // below always goes through the approval workflow, regardless of the requested price.
    const priceAdjustmentScenarios = [
        { justification: 'Competitor is offering this SKU at a lower price locally', decision: 'approved' },
        { justification: 'One-off deal to close a large order this week', decision: null },
        { justification: 'Bulk purchase, requesting a per-unit discount', decision: 'approved' },
        { justification: 'Matching a price quoted by the customer from another supplier', decision: null },
    ];
    const existingAdjustmentJustifications = await existingJustifications(directorToken, 'priceAdjustmentApproval');
    for (const s of priceAdjustmentScenarios) {
        if (existingAdjustmentJustifications.has(s.justification)) continue;
        const { orderId, orderLineId } = await createDraftOrderLine(directorToken, customer.id, variant.id);
        const res = await gql(
            `mutation($orderId: ID!, $orderLineId: ID!, $requestedPrice: Int!, $justification: String) {
                requestPriceAdjustment(orderId: $orderId, orderLineId: $orderLineId, requestedPrice: $requestedPrice, justification: $justification) {
                    approvalRequestId
                }
            }`,
            { orderId, orderLineId, requestedPrice: 100, justification: s.justification },
            managerToken,
        );
        const requestId = res.data.requestPriceAdjustment.approvalRequestId;
        if (s.decision) {
            await gql(
                `mutation($requestId: ID!) { decidePriceAdjustmentRequest(requestId: $requestId, decision: "approved") { id } }`,
                { requestId },
                deptHeadToken,
            );
        }
        console.log(`✔ priceAdjustmentApproval: ${s.decision ?? 'pending'}`);
    }

    // --- creditTermApproval (within limit): varied counterparties/days/decisions ---
    const creditTermScenarios = [
        { counterpartyErpId: 'cnt-001', days: 7, justification: 'Temporary cash-flow gap, resolves next quarter', decision: 'approved' },
        { counterpartyErpId: 'cnt-002', days: 5, justification: 'Short delay while awaiting a bank transfer', decision: 'approved' },
        { counterpartyErpId: 'cnt-003', days: 10, justification: 'Extension requested during a busy seasonal period', decision: null },
        { counterpartyErpId: 'cnt-004', days: 3, justification: 'Minor delay due to accounting reconciliation', decision: 'approved' },
        { counterpartyErpId: 'cnt-005', days: 12, justification: 'Extension tied to an unusually large seasonal order', decision: null },
        { counterpartyErpId: 'cnt-006', days: 14, justification: 'Maximum within-limit extension for a long-term partner', decision: 'rejected', comment: 'Existing balance already elevated' },
    ];
    const existingCreditTermJustifications = await existingJustifications(directorToken, 'creditTermApproval');
    for (const s of creditTermScenarios) {
        if (existingCreditTermJustifications.has(s.justification)) continue;
        const res = await gql(
            `mutation($input: CreditTermRequestInput!) { requestCreditTermExtension(input: $input) { id requestType } }`,
            { input: { counterpartyErpId: s.counterpartyErpId, requestedExtraDays: s.days, justification: s.justification } },
            managerToken,
        );
        if (s.decision) {
            await gql(
                `mutation($requestId: ID!, $decision: String!, $comment: String) { decideCreditTermRequest(requestId: $requestId, decision: $decision, comment: $comment) { id } }`,
                { requestId: res.data.requestCreditTermExtension.id, decision: s.decision, comment: s.comment ?? null },
                deptHeadToken,
            );
        }
        console.log(`✔ creditTermApproval (within limit): ${s.decision ?? 'pending'} (${s.counterpartyErpId})`);
    }

    // --- creditTermApprovalEscalated (exceeds limit): varied counterparties/days/decisions ---
    const escalatedScenarios = [
        { counterpartyErpId: 'cnt-001', days: 30, justification: 'Customer requests extended terms for a seasonal restock order', decision: 'approved' },
        { counterpartyErpId: 'cnt-002', days: 45, justification: 'Customer wants to defer payment for a bulk seasonal order', decision: 'rejected', comment: 'Existing balance already near the credit limit' },
        { counterpartyErpId: 'cnt-007', days: 21, justification: 'Extension requested to bridge a large infrastructure project', decision: null },
        { counterpartyErpId: 'cnt-008', days: 60, justification: 'Long-term extension tied to a multi-month supply contract', decision: 'approved' },
        { counterpartyErpId: 'cnt-009', days: 25, justification: 'Extension requested pending resolution of a billing dispute', decision: null },
        { counterpartyErpId: 'cnt-010', days: 35, justification: 'Extension requested during a temporary cash-flow shortfall', decision: 'rejected', comment: 'Counterparty already past a prior extension' },
    ];
    const existingEscalatedJustifications = await existingJustifications(directorToken, 'creditTermApprovalEscalated');
    for (const s of escalatedScenarios) {
        if (existingEscalatedJustifications.has(s.justification)) continue;
        const res = await gql(
            `mutation($input: CreditTermRequestInput!) { requestCreditTermExtension(input: $input) { id requestType } }`,
            { input: { counterpartyErpId: s.counterpartyErpId, requestedExtraDays: s.days, justification: s.justification } },
            managerToken,
        );
        if (s.decision) {
            await gql(
                `mutation($requestId: ID!, $decision: String!, $comment: String) { decideCreditTermRequest(requestId: $requestId, decision: $decision, comment: $comment) { id } }`,
                { requestId: res.data.requestCreditTermExtension.id, decision: s.decision, comment: s.comment ?? null },
                securityToken,
            );
        }
        console.log(`✔ creditTermApprovalEscalated: ${s.decision ?? 'pending step 1'} (${s.counterpartyErpId})`);
    }

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
