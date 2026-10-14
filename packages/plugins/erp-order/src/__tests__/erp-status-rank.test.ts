import { describe, expect, it } from 'vitest';

import { canAdvanceErpStatus } from '../erp-status-rank';

const RANKS = new Map([
    ['UNDER_APPROVAL', 3],
    ['APPROVED', 4],
    ['PICKING', 5],
    ['SHIPPING', 6],
    ['DELIVERED', 8],
]);

describe('canAdvanceErpStatus', () => {
    it.each([
        ['CONFIRMED', 'PICKING', true],
        [null, 'UNDER_APPROVAL', true],
        ['PICKING', 'SHIPPING', true],
        ['SHIPPING', 'PICKING', false],
        ['SHIPPING', 'SHIPPING', false],
        ['DELIVERED', 'APPROVED', false],
        ['PICKING', 'CONFIRMED', false],
        ['CANCELLED', 'DELIVERED', false],
    ] as const)('%s -> %s is %s', (current, next, expected) => {
        expect(canAdvanceErpStatus(current, next, RANKS)).toBe(expected);
    });

    it('never applies a status the reference has no rank for', () => {
        expect(canAdvanceErpStatus('CONFIRMED', 'DELIVERING', RANKS)).toBe(false);
    });

    it('lets an order whose current status is unknown move on', () => {
        expect(canAdvanceErpStatus('LEGACY', 'APPROVED', RANKS)).toBe(true);
    });
});
