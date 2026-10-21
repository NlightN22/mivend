import { expect, test } from '@playwright/test';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    type BranchActor,
} from './branch-actors';
import { loadContourEnv, envValue } from './contour-env';
import { expectedProformaIds, proformaStatus, type SampleProforma } from './proforma-scope';
import {
    openIssueIds,
    paymentSample,
    proformasByIds,
    refundCount,
    type PaymentSample,
} from './payment-fixtures';

const PROFORMAS = `query($cp: ID!) { visibleProformaInvoices(counterpartyId: $cp, options: { take: 200 }) {
    items { id } } }`;
const PAYMENTS = `query($cp: ID!) { visiblePayments(counterpartyId: $cp, options: { take: 200 }) {
    totalItems items { id } } }`;
const ISSUES = `query { openPaymentReconciliationIssues(options: { take: 200 }) { totalItems items { id } } }`;
const REFUND = `mutation($p: ID!) { recordPaymentRefund(paymentId: $p, amount: 1, reason: "e2e denied") { id } }`;
const WITHDRAW = `mutation($id: ID!) { withdrawProformaInvoice(id: $id) { id status } }`;
const DENIED = /not currently authorized|No \w+ with the id "\d+" could be found|not found/i;

type Payments = { totalItems: number; items: { id: string }[] };

test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 });

let superadmin: string;
let samples: PaymentSample[];
const hiddenSeen = new Set<string>();

// Customer A's and customer B's counterparties sit in different branches: one payment and refund on each.
test.beforeAll(async () => {
    test.setTimeout(15 * 60_000);
    superadmin = await superadminToken();
    const email = envValue('STAGING_TEST_CUSTOMER_B_EMAIL');
    const password = envValue('STAGING_TEST_CUSTOMER_B_PASSWORD');
    expect(email && password, 'STAGING_TEST_CUSTOMER_B_* in the staging env file').toBeTruthy();
    samples = [
        await paymentSample(superadmin, loadContourEnv().customer),
        await paymentSample(superadmin, { email: email!, password: password! }),
    ];
    expect(samples[0].proforma.homeBranchId).not.toBe(samples[1].proforma.homeBranchId);
});

async function query<T>(token: string, q: string, vars?: Record<string, unknown>): Promise<T> {
    const result = await adminCall(token, q, vars);
    expect(result.errors).toEqual([]);
    return result.data as T;
}

async function seen(
    token: string,
    s: PaymentSample,
): Promise<{ proforma: boolean; payment?: Payments['items'][0] }> {
    const cp = s.proforma.counterpartyId;
    const p = await query<{ visibleProformaInvoices: { items: { id: string }[] } }>(
        token,
        PROFORMAS,
        { cp },
    );
    const pay = await query<{ visiblePayments: Payments }>(token, PAYMENTS, { cp });
    return {
        proforma: p.visibleProformaInvoices.items.some(i => i.id === s.proforma.id),
        payment: pay.visiblePayments.items.find(i => i.id === s.paymentId),
    };
}

function expectedVisible(actor: BranchActor, proformas: SampleProforma[]): Set<string> {
    const state = actorState(actor);
    // As in group 15: branch scope keeps other branches' clients only when own or granted.
    const clients = expectedIds(actor, { ...state, branchId: null });
    return expectedProformaIds(actor, state, clients, proformas);
}

async function issueIds(token: string): Promise<string[]> {
    const data = await query<{ openPaymentReconciliationIssues: { items: { id: string }[] } }>(
        token,
        ISSUES,
    );
    return data.openPaymentReconciliationIssues.items.map(i => i.id).sort();
}

test('16: the superadmin sees both payments and every open issue', async () => {
    for (const s of samples) {
        const got = await seen(superadmin, s);
        expect(got.proforma, `proforma ${s.proforma.number}`).toBe(true);
        expect(got.payment, `payment ${s.paymentId}`).toBeDefined();
        expect(refundCount(s.paymentId), 'the sample refund exists').toBeGreaterThan(0);
    }
    const open = openIssueIds();
    if (open.length === 0)
        test.info().annotations.push({
            type: 'gap',
            description: 'no open payment reconciliation issue on the contour',
        });
    expect(await issueIds(superadmin)).toEqual(open.map(i => i.id).sort());
});

for (const actor of ACTORS) {
    test(`16: ${actor.key} (${actor.role}, ${actor.scope}): proformas, payments, issues, denied refund and withdraw`, async () => {
        test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
        const token = await actorToken(actor.key);
        const expected = expectedVisible(
            actor,
            samples.map(s => s.proforma),
        );
        for (const s of samples) {
            const shown = expected.has(s.proforma.id);
            const got = await seen(token, s);
            expect(got.proforma, `proforma ${s.proforma.number}`).toBe(shown);
            expect(got.payment !== undefined, `payment ${s.paymentId}`).toBe(shown);
            const refunds = refundCount(s.paymentId);
            const refund = await adminCall(token, REFUND, { p: s.paymentId });
            expect(refund.errors.join(' '), 'recordPaymentRefund is superadmin only').toMatch(
                DENIED,
            );
            expect(refundCount(s.paymentId)).toBe(refunds);
            if (shown) continue;
            hiddenSeen.add(actor.key);
            const status = proformaStatus(s.proforma.id);
            const withdraw = await adminCall(token, WITHDRAW, { id: s.proforma.id });
            expect(withdraw.errors.join(' '), `withdraw ${s.proforma.number}`).toMatch(DENIED);
            expect(proformaStatus(s.proforma.id)).toBe(status);
        }

        const open = openIssueIds();
        const issueProformas = proformasByIds(
            open.flatMap(i => (i.proformaId ? [i.proformaId] : [])),
        );
        const visible = issueProformas.length
            ? expectedVisible(actor, issueProformas)
            : new Set<string>();
        const want = open
            .filter(
                i => actor.scope === 'all' || (i.proformaId !== null && visible.has(i.proformaId)),
            )
            .map(i => i.id)
            .sort();
        expect(await issueIds(token)).toEqual(want);
    });
}

test('16: every scoped actor had a hidden payment and proforma', () => {
    for (const actor of ACTORS.filter(a => a.scope !== 'all' && actorCredentials(a.key)))
        expect(hiddenSeen.has(actor.key), `${actor.key} had a hidden case`).toBe(true);
});
