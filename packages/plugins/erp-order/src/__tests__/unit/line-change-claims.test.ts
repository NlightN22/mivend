import { describe, expect, it } from 'vitest';

import { buildOrderChanges } from '../../order-line-changes/line-change-events';
import type { LineChangeSource } from '../../order-line-changes/line-change.types';

const lines = [{ id: 1, productErpId: 'p-1', quantity: 10 }];

const claim = (quantity: number, over: Partial<LineChangeSource> = {}): LineChangeSource => ({
    kind: 'return',
    productErpId: 'p-1',
    quantity,
    amountMinor: quantity * 100,
    reflectedInAccounting: false,
    documentNumber: 'k1',
    documentDate: new Date('2026-01-01'),
    ...over,
});

const correction = (quantity: number): LineChangeSource => ({
    ...claim(quantity),
    kind: 'realization-correction',
    reflectedInAccounting: true,
    documentNumber: 'c1',
    documentDate: new Date('2026-01-02'),
});

describe('claim and correction of one return', () => {
    it('counts an equal claim and correction once', () => {
        const r = buildOrderChanges(lines, [claim(-2), correction(-2)], 'staff');
        expect(r.lines[0].events.map(e => e.kind)).toEqual(['realization-correction']);
        expect(r.lines[0].actual).toBe(8);
        expect(r.amountDeltaMinor).toBe(-200);
    });

    it('keeps a claim that has no correction yet', () => {
        const r = buildOrderChanges(lines, [claim(-2)], 'staff');
        expect(r.lines[0].events.map(e => e.kind)).toEqual(['return']);
        expect(r.amountDeltaMinor).toBe(-200);
    });

    it('keeps a correction without a claim', () => {
        const r = buildOrderChanges(lines, [correction(-3)], 'staff');
        expect(r.lines[0].actual).toBe(7);
        expect(r.amountDeltaMinor).toBe(-300);
    });

    it('shows only the uncovered part of a claim larger than its correction', () => {
        const r = buildOrderChanges(lines, [claim(-5), correction(-2)], 'staff');
        expect(r.lines[0].events.map(e => [e.kind, e.quantity])).toEqual([
            ['return', -3],
            ['realization-correction', -2],
        ]);
        expect(r.lines[0].actual).toBe(5);
        expect(r.amountDeltaMinor).toBe(-500);
    });

    it('consumes the correction by several claims, oldest first', () => {
        const r = buildOrderChanges(
            lines,
            [
                claim(-2, { documentNumber: 'k2', documentDate: new Date('2026-01-03') }),
                claim(-2),
                correction(-3),
            ],
            'staff',
        );
        expect(r.lines[0].events.map(e => [e.documentNumber, e.quantity])).toEqual([
            ['c1', -3],
            ['k2', -1],
        ]);
        expect(r.amountDeltaMinor).toBe(-400);
    });

    it('does not net across products', () => {
        const r = buildOrderChanges(
            [...lines, { id: 2, productErpId: 'p-2', quantity: 4 }],
            [claim(-1, { productErpId: 'p-2' }), correction(-1)],
            'staff',
        );
        expect(r.lines.map(l => l.events.length)).toEqual([1, 1]);
    });
});
