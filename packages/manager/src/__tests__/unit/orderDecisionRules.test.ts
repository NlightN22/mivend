import { describe, expect, it } from 'vitest';
import {
    mayConfirm,
    mayReject,
    openFindings,
    parseReservationDays,
    type OrderDecisionFacts,
} from '../../composables/orderDecisionRules';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';

const facts = (over: Partial<OrderDecisionFacts> = {}): OrderDecisionFacts => ({
    state: 'ArrangingPayment',
    cancellable: true,
    reservationState: 'AWAITING_CONFIRMATION',
    ...over,
});

const finding = (over: Partial<OrderCheckFinding>): OrderCheckFinding => ({
    id: '1',
    checkCode: 'c',
    stage: null,
    lineRef: null,
    severity: 'error',
    messageKey: 'k',
    facts: {},
    computedAt: '',
    stale: false,
    ...over,
});

describe('order decision rules', () => {
    it('confirm needs the permission and an order awaiting confirmation', () => {
        expect(mayConfirm(facts(), true)).toBe(true);
        expect(mayConfirm(facts(), false)).toBe(false);
        expect(mayConfirm(facts({ reservationState: 'CONFIRMED' }), true)).toBe(false);
        expect(mayConfirm(facts({ state: 'Cancelled' }), true)).toBe(false);
    });

    it('reject needs the permission and the server cancellable flag', () => {
        expect(mayReject(facts(), true)).toBe(true);
        expect(mayReject(facts(), false)).toBe(false);
        expect(mayReject(facts({ cancellable: false }), true)).toBe(false);
    });

    it('accepts only positive whole days', () => {
        expect(parseReservationDays('3')).toBe(3);
        for (const bad of ['', '0', '-1', '1.5', 'x']) expect(parseReservationDays(bad)).toBeNull();
    });

    it('lists open findings and drops stale and info ones', () => {
        const kept = finding({ id: 'a' });
        const list = [
            kept,
            finding({ id: 'b', stale: true }),
            finding({ id: 'c', severity: 'info' }),
        ];
        expect(openFindings(list)).toEqual([kept]);
    });
});
