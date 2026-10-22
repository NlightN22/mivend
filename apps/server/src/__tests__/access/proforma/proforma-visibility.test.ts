import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, seed, staff, staffToken } from '../harness/actors';
import { orderOf, pointState, setPointBranch } from '../order/order-queries';
import {
    COUNTERPARTIES,
    STAFF,
    VISIBLE_A_OWN_PROFORMAS,
    type ActorKey,
} from '../seed/fixture-plan';
import type { OrderSeedIds } from '../seed/orders-seed';
import { DENIED_OR_MISSING, proformaStatus } from './proforma-queries';

const LIST = `query($cp: ID!, $search: String) { visibleProformaInvoices(counterpartyId: $cp,
    options: { take: 200, search: $search }) { totalItems items { id } } }`;
const FOR_ORDER = `query($id: ID!) { proformaInvoicesForOrder(orderId: $id) { id } }`;
const BALANCE = `query($cp: ID!) { proformaInvoiceOutstandingBalance(counterpartyId: $cp) { amount } }`;
const PAYMENTS = `query($cp: ID!) { visiblePayments(counterpartyId: $cp, options: { take: 200 }) { totalItems } }`;
const WITHDRAW = `mutation($id: ID!) { withdrawProformaInvoice(id: $id) { id status } }`;

type List = { totalItems: number; items: { id: string }[] };

const cp = (): string => seed().counterparties['a-own'];
const samples = (): OrderSeedIds['aOwnProformas'] => seed().ordering.aOwnProformas;
const hiddenSeen = new Set<ActorKey>();

async function listFor(token: string, search?: string): Promise<List> {
    const result = await admin<{ visibleProformaInvoices: List }>(token, LIST, {
        cp: cp(),
        search,
    });
    expect(result.errors).toEqual([]);
    return result.data!.visibleProformaInvoices;
}

async function paymentTotal(token: string): Promise<number> {
    const result = await admin<{ visiblePayments: { totalItems: number } }>(token, PAYMENTS, {
        cp: cp(),
    });
    expect(result.errors).toEqual([]);
    return result.data!.visiblePayments.totalItems;
}

// Home: the a-own point keeps the counterparty's branch A. Moved: the point is serviced by branch B.
describe.each(['home', 'moved'] as const)('proformas of a-own, point %s', phase => {
    let superadmin: string;
    let total: number;
    let payments: number;
    let original: string | null;
    const pointId = (): string => orderOf('a-own').pointId;

    beforeAll(async () => {
        superadmin = await staffToken('superadmin');
        original = (await pointState(pointId())).servicingBranchId;
        if (phase === 'moved') await setPointBranch(pointId(), seed().branches.b);
        total = (await listFor(superadmin)).totalItems;
        payments = await paymentTotal(superadmin);
    });
    afterAll(async () => {
        if (phase !== 'moved') return;
        await setPointBranch(pointId(), original);
        expect((await pointState(pointId())).servicingBranchId, 'the point is back').toBe(original);
    });

    it('the superadmin sees every sample proforma and payment', async () => {
        const all = await listFor(superadmin);
        // a-own: one cancelled, one issued, one paid.
        expect(all.totalItems).toBe(3);
        for (const s of Object.values(samples())) expect(all.items.map(i => i.id)).toContain(s.id);
        expect(payments).toBe(1);
    });

    it.each(STAFF.map(s => s.key))(
        '%s: list, search, order, balance, payments, withdraw',
        async key => {
            const token = await staffToken(key);
            const shown = VISIBLE_A_OWN_PROFORMAS[phase].includes(key);
            expect((await listFor(token)).totalItems).toBe(shown ? total : 0);
            for (const s of Object.values(samples())) {
                const found = await listFor(token, s.number);
                expect(
                    found.items.some(i => i.id === s.id),
                    `search ${s.number}`,
                ).toBe(shown);
            }
            const forOrder = await admin<{ proformaInvoicesForOrder: { id: string }[] }>(
                token,
                FOR_ORDER,
                { id: orderOf('a-own').id },
            );
            expect(forOrder.errors).toEqual([]);
            const byOrder = forOrder.data!.proformaInvoicesForOrder;
            expect(
                byOrder.some(p => p.id === samples().issued.id),
                'proformas of the order',
            ).toBe(shown);
            const balance = await admin<{ proformaInvoiceOutstandingBalance: unknown }>(
                token,
                BALANCE,
                { cp: cp() },
            );
            expect(balance.errors).toEqual([]);
            expect(balance.data!.proformaInvoiceOutstandingBalance !== null, 'balance').toBe(shown);
            expect(await paymentTotal(token)).toBe(shown ? payments : 0);
            if (shown) return;
            hiddenSeen.add(key);
            // A cancelled proforma: a withdraw that slipped through would return it unchanged.
            const withdraw = await admin(token, WITHDRAW, { id: samples().cancelled.id });
            expect(withdraw.errors.join(' '), 'withdraw').toMatch(DENIED_OR_MISSING);
            expect(await proformaStatus(samples().cancelled.number)).toBe('cancelled');
        },
    );
});

it('every scoped actor but the a-own manager misses the samples in one of the phases', () => {
    const owner = COUNTERPARTIES.find(c => c.key === 'a-own')!.manager;
    for (const s of STAFF.filter(a => staff(a.key).scope !== 'all' && a.key !== owner))
        expect(hiddenSeen.has(s.key), `${s.key} had a hidden case`).toBe(true);
});
