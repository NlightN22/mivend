import { expect, test } from '@playwright/test';
import { adminCall, superadminToken } from './price-type-access';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    type ActorState,
} from './branch-actors';
import { pointOverride } from './order-scope';
import {
    counterpartyProformaCount,
    expectedProformaIds,
    proformaStatus,
    sampleProformas,
    type SampleProforma,
} from './proforma-scope';

const LIST = `query($cp: ID!, $search: String) { visibleProformaInvoices(counterpartyId: $cp,
    options: { take: 200, search: $search }) { totalItems items { id } } }`;
const FOR_ORDER = `query($id: ID!) { proformaInvoicesForOrder(orderId: $id) { id } }`;
const BALANCE = `query($cp: ID!) { proformaInvoiceOutstandingBalance(counterpartyId: $cp) { amount } }`;
const PAYMENTS = `query($cp: ID!) { visiblePayments(counterpartyId: $cp, options: { take: 200 }) { totalItems } }`;
const WITHDRAW = `mutation($id: ID!) { withdrawProformaInvoice(id: $id) { id status } }`;
const OVERRIDE = `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`;
const DENIED = /not currently authorized|No \w+ with the id "\d+" could be found|not found/i;

type List = { totalItems: number; items: { id: string }[] };

let superadmin: string;
let samples: SampleProforma[];
let cp: string;
const hiddenSeen = new Set<string>();

test.beforeAll(async () => {
    superadmin = await superadminToken();
    samples = sampleProformas();
    expect(samples.length, 'an issued and a cancelled proforma on one point').toBe(2);
    cp = samples[0].counterpartyId;
});

async function listFor(token: string, search?: string): Promise<List> {
    const result = await adminCall(token, LIST, { cp, search });
    expect(result.errors).toEqual([]);
    return (result.data as { visibleProformaInvoices: List }).visibleProformaInvoices;
}

// Home: the counterparty's branch. Moved: the point overrides it with the other head's branch.
for (const phase of ['home', 'moved'] as const) {
    test.describe(`15: proformas, point ${phase}`, () => {
        test.describe.configure({ mode: 'serial' });
        let moved: boolean;

        test.beforeAll(async () => {
            moved = false;
            if (phase === 'home') return;
            const other = ACTORS.filter(a => a.scope === 'branch' && actorCredentials(a.key))
                .map(a => actorState(a).branchId)
                .find(b => b && b !== samples[0].homeBranchId);
            expect(other, 'a head of a branch other than the counterparty one').toBeTruthy();
            const set = await adminCall(superadmin, OVERRIDE, { id: samples[0].pointId, b: other });
            expect(set.errors).toEqual([]);
            moved = true;
            expect(pointOverride(samples[0].pointId)).toBe(other);
        });
        test.afterAll(async () => {
            if (!moved) return;
            const reset = await adminCall(superadmin, OVERRIDE, {
                id: samples[0].pointId,
                b: null,
            });
            expect(reset.errors).toEqual([]);
            expect(pointOverride(samples[0].pointId), 'the override is removed').toBeNull();
        });

        test('the superadmin sees every sample proforma', async () => {
            const all = await listFor(superadmin);
            expect(all.totalItems).toBe(counterpartyProformaCount(cp));
            for (const s of samples) expect(all.items.map(i => i.id)).toContain(s.id);
        });

        for (const actor of ACTORS) {
            test(`${actor.key} (${actor.role}, ${actor.scope}): list, search, order, balance, payments, withdraw`, async () => {
                test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
                const state: ActorState = actorState(actor);
                // Branch scope keeps other branches' clients only when own or granted, so the branch is left out here.
                const clients = expectedIds(actor, { ...state, branchId: null });
                const expected = expectedProformaIds(actor, state, clients, samples);
                const token = await actorToken(actor.key);
                // All proformas of one point share its read-time branch, so the counterparty's set is all or none.
                const shown = expected.size > 0;
                expect(expected.size, 'samples move together').toBe(shown ? samples.length : 0);

                const list = await listFor(token);
                expect(list.totalItems).toBe(shown ? counterpartyProformaCount(cp) : 0);
                for (const s of samples) {
                    const found = await listFor(token, s.number);
                    expect(
                        found.items.some(i => i.id === s.id),
                        `search ${s.number}`,
                    ).toBe(shown);
                }

                const issued = samples.find(s => s.status === 'issued')!;
                const forOrder = await adminCall(token, FOR_ORDER, { id: issued.orderId });
                expect(forOrder.errors).toEqual([]);
                const byOrder = (forOrder.data as { proformaInvoicesForOrder: { id: string }[] })
                    .proformaInvoicesForOrder;
                expect(
                    byOrder.some(p => p.id === issued.id),
                    'proformas of the order',
                ).toBe(shown);

                const balance = await adminCall(token, BALANCE, { cp });
                expect(balance.errors).toEqual([]);
                const amount = (balance.data as { proformaInvoiceOutstandingBalance: unknown })
                    .proformaInvoiceOutstandingBalance;
                expect(amount !== null, 'outstanding balance').toBe(shown);

                const all = await adminCall(superadmin, PAYMENTS, { cp });
                const total = (all.data as { visiblePayments: { totalItems: number } })
                    .visiblePayments.totalItems;
                if (total > 0) {
                    const mine = await adminCall(token, PAYMENTS, { cp });
                    expect(mine.errors).toEqual([]);
                    expect(
                        (mine.data as { visiblePayments: { totalItems: number } }).visiblePayments
                            .totalItems,
                    ).toBe(shown ? total : 0);
                }

                if (shown) return;
                hiddenSeen.add(actor.key);
                // A cancelled proforma: a withdraw that slipped through would return it unchanged.
                const cancelled = samples.find(s => s.status === 'cancelled')!;
                const withdraw = await adminCall(token, WITHDRAW, { id: cancelled.id });
                expect(withdraw.errors.join(' '), `withdraw ${cancelled.number}`).toMatch(DENIED);
                expect(proformaStatus(cancelled.id)).toBe('cancelled');
            });
        }

        test('every scoped actor misses the samples in one of the phases', () => {
            test.skip(phase === 'home', 'checked after both phases');
            for (const actor of ACTORS.filter(a => a.scope !== 'all' && actorCredentials(a.key))) {
                // The only proformas on the contour belong to one client; its own manager sees them in any branch.
                if (actor.scope === 'own' && expectedIds(actor, actorState(actor)).has(cp)) {
                    test.info().annotations.push({
                        type: 'gap',
                        description: `${actor.key}: no hidden proforma`,
                    });
                    continue;
                }
                expect(hiddenSeen.has(actor.key), `${actor.key} had a hidden case`).toBe(true);
            }
        });
    });
}
