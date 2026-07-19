// Seeds realistic-looking PaymentRefund/Dispute rows for existing captured online-acquiring
// payments, so the storefront /payments page has real refund/dispute data to show instead of a
// mock-tagged placeholder.
//
// PaymentRefund/Dispute are payment-provider-reported workflow state, not ERP master data — they
// cannot be expressed as an erp-import record type (see AGENTS.md "Dev seed rules" exception
// clause). Goes through real Admin GraphQL mutations instead (recordPaymentRefund/
// recordPaymentDispute), same pattern as this directory's own seed-approvals.mjs.
//
// Field shapes are modeled on Robokassa's real refund API (docs.robokassa.ru/partner-api/
// MethodDescription/RefundOperation) — providerRefundId mirrors Robokassa's OpKey format
// (a numeric operation id), amounts are partial or full refunds of the source payment.
//
// Run: node infrastructure/scripts/seed-payment-refunds.mjs
// Requires: server running, `make seed` already run (needs some captured online-acquiring
// payments to exist — e.g. from checkout flows or e2e runs; if none exist yet, this script logs
// a notice and exits without error, it does not fail `make seed-all`).

const API_URL = `http://localhost:${process.env.PORT ?? '3000'}/admin-api`;

async function gql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
}

async function login(username, password) {
    const headers = { 'Content-Type': 'application/json' };
    const res = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
                ... on CurrentUser { id }
                ... on InvalidCredentialsError { message }
            }}`,
            variables: { u: username, p: password },
        }),
    });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (!authToken) throw new Error(`Login failed for ${username}: ${JSON.stringify(json)}`);
    return authToken;
}

// A handful of realistic Robokassa-style refund/dispute scenarios, applied to the N most
// recently captured online-acquiring payments (oldest scenario first, capped by however many
// real payments actually exist).
const SCENARIOS = [
    { kind: 'refund', fraction: 1, providerRefundId: '48213077', status: 'succeeded', reason: 'Customer requested full refund — order canceled before shipment' },
    { kind: 'refund', fraction: 0.3, providerRefundId: '48213108', status: 'succeeded', reason: 'Partial refund — one line item returned' },
    { kind: 'refund', fraction: 0.5, providerRefundId: '48213142', status: 'pending', reason: 'Refund requested, awaiting acquirer confirmation' },
    { kind: 'dispute', type: 'chargeback', status: 'opened', reason: 'chargeback' },
    { kind: 'dispute', type: 'dispute', status: 'won', reason: 'dispute' },
];

async function main() {
    console.log('\n── Seeding payment refunds/disputes (online-acquiring) ──\n');

    const token = await login('superadmin', 'superadmin');

    const { capturedOnlinePayments: payments } = await gql(
        `query($take: Int) { capturedOnlinePayments(take: $take) { id amount currencyCode } }`,
        { take: SCENARIOS.length },
        token,
    );

    if (payments.length === 0) {
        console.log('No captured online-acquiring payments found yet — nothing to seed. Run a checkout with the online-stub payment method first, then re-run this script.');
        return;
    }

    for (let i = 0; i < Math.min(payments.length, SCENARIOS.length); i++) {
        const payment = payments[i];
        const scenario = SCENARIOS[i];

        if (scenario.kind === 'refund') {
            const { paymentRefundExists: exists } = await gql(
                `query($id: String!) { paymentRefundExists(providerRefundId: $id) }`,
                { id: scenario.providerRefundId },
                token,
            );
            if (exists) {
                console.log(`… Refund ${scenario.providerRefundId} already seeded, skipping.`);
                continue;
            }
            const amount = Math.round(payment.amount * scenario.fraction);
            await gql(
                `mutation($paymentId: ID!, $amount: Int!, $reason: String!, $providerRefundId: String, $status: String) {
                    recordPaymentRefund(paymentId: $paymentId, amount: $amount, reason: $reason, providerRefundId: $providerRefundId, status: $status) { id }
                }`,
                { paymentId: payment.id, amount, reason: scenario.reason, providerRefundId: scenario.providerRefundId, status: scenario.status },
                token,
            );
            console.log(`✔ Refund on payment ${payment.id}: ${(amount / 100).toFixed(2)} ${payment.currencyCode} (${scenario.status})`);
        } else {
            const { paymentDisputeExists: exists } = await gql(
                `query($paymentId: ID!, $type: String!) { paymentDisputeExists(paymentId: $paymentId, type: $type) }`,
                { paymentId: payment.id, type: scenario.type },
                token,
            );
            if (exists) {
                console.log(`… ${scenario.type} on payment ${payment.id} already seeded, skipping.`);
                continue;
            }
            await gql(
                `mutation($paymentId: ID!, $type: String!, $amount: Int!, $status: String) {
                    recordPaymentDispute(paymentId: $paymentId, type: $type, amount: $amount, status: $status) { id }
                }`,
                { paymentId: payment.id, type: scenario.type, amount: payment.amount, status: scenario.status },
                token,
            );
            console.log(`✔ ${scenario.type} on payment ${payment.id} (${scenario.status})`);
        }
    }

    console.log('\nDone.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
