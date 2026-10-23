import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, seed, staff, staffToken } from '../harness/actors';
import { orderOf } from '../order/order-queries';
import {
    APPROVAL_READERS,
    APPROVAL_REQUESTERS,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_ORDERS,
    type ActorKey,
    type ApprovalKey,
} from '../seed/fixture-plan';

const ONE = `query($id: ID!) { approvalRequest(id: $id) { id } }`;
const INBOX = `{ myApprovalsInbox(awaitingOptions: { take: 100 }, allInvolvedOptions: { take: 100 }) {
    awaitingMyDecision { totalItems items { id } } allInvolved { totalItems items { id } } } }`;
const PENDING_ORDERS = `{ pendingPriceAdjustmentOrderIds }`;
const FOR_ORDER = `query($id: ID!) { priceAdjustmentRequestsForOrder(orderId: $id) { id } }`;
const DECIDE_ADJUSTMENT = `mutation($id: ID!) { decidePriceAdjustmentRequest(requestId: $id, decision: "rejected") { id status } }`;
const DECIDE_CREDIT = `mutation($id: ID!) { decideCreditTermRequest(requestId: $id, decision: "rejected") { id status } }`;
const STATUS = `query($id: ID!) { approvalRequest(id: $id) { status } }`;

const KEYS = Object.keys(APPROVAL_REQUESTERS) as ApprovalKey[];

const adjustmentsOf = (key: ApprovalKey): string[] => {
    const ids = seed().approvals;
    return key === 'a-own' ? [ids.adjustments[key], ids.probe] : [ids.adjustments[key]];
};
const allSeeded = (): string[] =>
    KEYS.flatMap(k => [...adjustmentsOf(k), seed().approvals.creditTerms[k]]).sort();

// A request follows its order (price adjustment) or its counterparty (credit term).
function expectedFor(actor: ActorKey): string[] {
    const orders: string[] = VISIBLE_ORDERS[actor];
    const cps: string[] = VISIBLE_COUNTERPARTIES[actor];
    return KEYS.flatMap(k => [
        ...(orders.includes(k) ? adjustmentsOf(k) : []),
        ...(cps.includes(k) ? [seed().approvals.creditTerms[k]] : []),
    ]).sort();
}

interface Page {
    totalItems: number;
    items: { id: string }[];
}

async function inbox(token: string): Promise<{ awaiting: Page; involved: Page }> {
    const r = await admin<{ myApprovalsInbox: { awaitingMyDecision: Page; allInvolved: Page } }>(
        token,
        INBOX,
    );
    expect(r.errors).toEqual([]);
    return {
        awaiting: r.data!.myApprovalsInbox.awaitingMyDecision,
        involved: r.data!.myApprovalsInbox.allInvolved,
    };
}

const seededIn = (page: Page): string[] => {
    const seeded = new Set(allSeeded());
    return page.items
        .map(i => i.id)
        .filter(id => seeded.has(id))
        .sort();
};

describe.each(APPROVAL_READERS)('approval requests for %s', (key: ActorKey) => {
    let token: string;
    const decider = staff(key).role !== 'manager';

    beforeAll(async () => {
        token = await staffToken(key);
    });

    it('by id, each request is visible exactly when its order or counterparty is', async () => {
        const expected = expectedFor(key);
        if (staff(key).scope !== 'all')
            expect(expected.length, 'a hidden request exists').toBeLessThan(allSeeded().length);
        for (const id of allSeeded()) {
            const r = await admin<{ approvalRequest: { id: string } | null }>(token, ONE, { id });
            expect(r.errors).toEqual([]);
            expect(r.data!.approvalRequest !== null, `request ${id}`).toBe(expected.includes(id));
        }
    });

    it('the inbox lists only visible requests and its counts match', async () => {
        const { awaiting, involved } = await inbox(token);
        expect(awaiting.totalItems).toBe(awaiting.items.length);
        expect(involved.totalItems).toBe(involved.items.length);
        const expected = expectedFor(key);
        if (decider) {
            // Every seeded request waits at a department-head step, so a decider sees all it may see.
            expect(seededIn(awaiting)).toEqual(expected);
        } else {
            const own = KEYS.filter(k => APPROVAL_REQUESTERS[k] === key).flatMap(k => [
                ...adjustmentsOf(k),
                seed().approvals.creditTerms[k],
            ]);
            expect(own.length, 'the manager requested something').toBeGreaterThan(0);
            expect(seededIn(involved)).toEqual(own.sort());
        }
        for (const id of [...seededIn(awaiting), ...seededIn(involved)])
            expect(expected, `inbox request ${id}`).toContain(id);
    });

    it("an order's price adjustments are listed only for a visible order", async () => {
        const visible: string[] = VISIBLE_ORDERS[key];
        const pending = await admin<{ pendingPriceAdjustmentOrderIds: string[] }>(
            token,
            PENDING_ORDERS,
        );
        expect(pending.errors).toEqual([]);
        const seededOrders = KEYS.map(k => orderOf(k).id);
        expect(
            pending
                .data!.pendingPriceAdjustmentOrderIds.filter(id => seededOrders.includes(id))
                .sort(),
        ).toEqual(
            KEYS.filter(k => visible.includes(k))
                .map(k => orderOf(k).id)
                .sort(),
        );
        for (const k of KEYS) {
            const r = await admin<{ priceAdjustmentRequestsForOrder: { id: string }[] }>(
                token,
                FOR_ORDER,
                { id: orderOf(k).id },
            );
            expect(r.errors).toEqual([]);
            const ids = r.data!.priceAdjustmentRequestsForOrder.map(i => i.id).sort();
            expect(ids, `adjustments of ${k}`).toEqual(
                visible.includes(k) ? adjustmentsOf(k).sort() : [],
            );
        }
    });

    if (staff(key).scope === 'all')
        it("sees exactly the superadmin's seeded requests", async () => {
            const all = await inbox(await staffToken('superadmin'));
            expect(seededIn(all.awaiting)).toEqual(allSeeded());
            expect(seededIn((await inbox(token)).awaiting)).toEqual(seededIn(all.awaiting));
        });
});

describe('deciding follows the scope', () => {
    const status = async (id: string): Promise<string> => {
        const r = await admin<{ approvalRequest: { status: string } }>(
            await staffToken('superadmin'),
            STATUS,
            { id },
        );
        expect(r.errors).toEqual([]);
        return r.data!.approvalRequest.status;
    };

    it('a head of another branch cannot decide a request, which stays pending', async () => {
        const token = await staffToken('head-b');
        const { probe, creditTerms } = seed().approvals;
        for (const [mutation, id] of [
            [DECIDE_ADJUSTMENT, probe],
            [DECIDE_CREDIT, creditTerms['a-own']],
        ]) {
            const r = await admin(token, mutation, { id });
            expect(r.errors.join(' '), id).toMatch(DENIED);
            expect(await status(id)).toBe('pending');
        }
    });

    it("the order's own branch head decides it", async () => {
        const { probe } = seed().approvals;
        const r = await admin(await staffToken('head-a'), DECIDE_ADJUSTMENT, { id: probe });
        expect(r.errors).toEqual([]);
        expect(await status(probe)).toBe('rejected');
    });
});
