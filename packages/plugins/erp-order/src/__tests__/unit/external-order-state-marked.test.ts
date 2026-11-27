import { describe, expect, it } from 'vitest';

import { NEW_ORDER_POSTING, planExternalStatus } from '../../external-order-state';
import type { PostingPlan, PostingState } from '../../external-order-state';
import type { OrderStatusDictionary } from '../../order-status-dictionary';

const dictionary = {
    codeWith: (flag: string) => (flag === 'cancelled' ? 'CANCELLED' : 'NEW'),
    has: (code: string | null, flag: string) => flag === 'cancelled' && code === 'CANCELLED',
    canAdvance: () => true,
} as unknown as OrderStatusDictionary;

interface Event {
    incoming?: string | null;
    isPosted?: boolean | null;
    marked?: boolean | null;
}

function run(
    initial: PostingState,
    events: Event[],
): { plans: PostingPlan[]; state: PostingState } {
    let state = { ...initial };
    const plans = events.map(e => {
        const plan = planExternalStatus(
            state,
            e.incoming ?? null,
            e.isPosted,
            dictionary,
            e.marked,
        );
        state = {
            erpStatus: plan.status ?? state.erpStatus,
            erpIsPosted:
                'erpIsPosted' in plan.facts ? (plan.facts.erpIsPosted ?? null) : state.erpIsPosted,
            erpStatusBeforeUnposted:
                'erpStatusBeforeUnposted' in plan.facts
                    ? (plan.facts.erpStatusBeforeUnposted ?? null)
                    : state.erpStatusBeforeUnposted,
            erpMarkedForDeletion: plan.facts.erpMarkedForDeletion ?? state.erpMarkedForDeletion,
        };
        return plan;
    });
    return { plans, state };
}

const shipped: PostingState = {
    erpStatus: 'SHIPPING',
    erpIsPosted: true,
    erpStatusBeforeUnposted: null,
    erpMarkedForDeletion: null,
};

describe('planExternalStatus with a deletion mark', () => {
    it('cancels a stored order, remembers the status and restores it when unmarked', () => {
        const { plans, state } = run(shipped, [
            { isPosted: true, marked: true },
            { isPosted: true, marked: false },
        ]);
        expect(plans[0]).toMatchObject({
            status: 'CANCELLED',
            facts: {
                erpIsPosted: false,
                erpStatusBeforeUnposted: 'SHIPPING',
                erpMarkedForDeletion: true,
            },
        });
        expect(plans[1].status).toBe('SHIPPING');
        expect(state).toMatchObject({ erpIsPosted: true, erpMarkedForDeletion: false });
    });

    it('creates an unknown marked order cancelled', () => {
        const { plans } = run(NEW_ORDER_POSTING, [{ isPosted: true, marked: true }]);
        expect(plans[0].status).toBe('CANCELLED');
        expect(plans[0].facts.erpMarkedForDeletion).toBe(true);
    });

    it('a repeat changes neither the status nor the saved status', () => {
        const { plans } = run(shipped, [{ marked: true }, { marked: true }]);
        expect(plans[1].status).toBeNull();
        expect(plans[1].facts).not.toHaveProperty('erpStatusBeforeUnposted');
    });

    it('a posted event without a mark (order state) does not reopen a marked order', () => {
        const { plans } = run(shipped, [{ marked: true }, { isPosted: true }]);
        expect(plans[1].status).toBeNull();
        expect(plans[1].facts).toEqual({ erpIsPosted: false });
    });

    it('a genuine ERP cancel stays terminal through mark and unmark', () => {
        const { plans, state } = run(shipped, [
            { marked: true },
            { incoming: 'CANCELLED', marked: true },
            { isPosted: true, marked: false },
        ]);
        expect(plans[1].facts).toMatchObject({ erpIsPosted: null, erpStatusBeforeUnposted: null });
        expect(plans[2].status).toBeNull();
        expect(state.erpStatus).toBe('CANCELLED');
    });

    it('an absent mark keeps the not-posted behaviour', () => {
        const { plans } = run(shipped, [{ isPosted: false }, { isPosted: true }]);
        expect(plans[0].facts).not.toHaveProperty('erpMarkedForDeletion');
        expect(plans[1].status).toBe('SHIPPING');
    });
});

describe('planExternalStatus un-mark without a posted flag', () => {
    const marked = (): PostingState => run(shipped, [{ marked: true }]).state;

    it('restores the saved status and clears the flags', () => {
        const { plans, state } = run(marked(), [{ marked: false }]);
        expect(plans[0].status).toBe('SHIPPING');
        expect(plans[0].facts).toMatchObject({
            erpIsPosted: true,
            erpStatusBeforeUnposted: null,
            erpMarkedForDeletion: false,
        });
        expect(state.erpStatus).toBe('SHIPPING');
    });

    it('stays cancelled when the same event says not posted', () => {
        const { plans, state } = run(marked(), [{ marked: false, isPosted: false }]);
        expect(plans[0].status).toBeNull();
        expect(plans[0].facts).toMatchObject({ erpIsPosted: false, erpMarkedForDeletion: false });
        expect(state.erpStatus).toBe('CANCELLED');
    });

    it('stays terminal when the order is also genuinely cancelled', () => {
        const { plans, state } = run(shipped, [
            { marked: true },
            { incoming: 'CANCELLED', marked: true },
            { marked: false },
        ]);
        expect(plans[2].status).toBeNull();
        expect(state.erpStatus).toBe('CANCELLED');
    });

    it('a repeated un-mark changes nothing', () => {
        const { plans } = run(marked(), [{ marked: false }, { marked: false }]);
        expect(plans[1].status).toBeNull();
    });
});
