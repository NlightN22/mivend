import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { isReflectedInAccounting } from '../../order-line-changes/line-change-accounting';
import { buildOrderChanges } from '../../order-line-changes/line-change-events';
import {
    claimGoodsSource,
    correctionGoodsSource,
} from '../../order-line-changes/line-change-sources';
import type { LineChangeSource } from '../../order-line-changes/line-change.types';
import {
    AdminOrderLineChangesResolver,
    ShopOrderLineChangesResolver,
} from '../../order-line-changes/order-line-changes.resolver';

const lines = [
    { id: 1, productErpId: 'p-1', quantity: 10 },
    { id: 2, productErpId: 'p-2', quantity: 4 },
];

const source = (over: Partial<LineChangeSource>): LineChangeSource => ({
    kind: 'realization-correction',
    productErpId: 'p-1',
    quantity: -1,
    amountMinor: -500,
    reflectedInAccounting: true,
    documentNumber: '10',
    documentDate: new Date('2026-01-02'),
    ...over,
});

describe('isReflectedInAccounting', () => {
    it.each([
        [{ reflectedInAccounting: true }, true],
        [{ reflectedInAccounting: false }, false],
        [{ reflectedInManagementAccounting: true }, false],
        [{}, false],
        [null, false],
        ['true', false],
    ])('%j -> %s', (accounting, expected) => {
        expect(isReflectedInAccounting(accounting)).toBe(expected);
    });
});

describe('buildOrderChanges', () => {
    it('keeps a running remainder in date order and the actual quantity', () => {
        const result = buildOrderChanges(
            lines,
            [
                source({
                    quantity: -2,
                    kind: 'return',
                    documentNumber: '12',
                    documentDate: new Date('2026-01-05'),
                }),
                source({ quantity: -1 }),
            ],
            'staff',
        );
        const change = result.lines[0];
        expect(change.events.map(e => [e.quantity, e.remainder])).toEqual([
            [-1, 9],
            [-1, 8],
        ]);
        expect([change.ordered, change.actual]).toEqual([10, 8]);
        expect(change.events[0].subtitleKey).toBe('decreased');
        expect(result.amountDeltaMinor).toBe(-750);
    });

    it('shows a customer only accounting-reflected documents and no money', () => {
        const result = buildOrderChanges(
            lines,
            [
                source({}),
                source({ reflectedInAccounting: false, quantity: -5, documentNumber: '11' }),
            ],
            'customer',
        );
        expect(result.lines[0].events).toHaveLength(1);
        expect(result.lines[0].actual).toBe(9);
        expect(result.amountDeltaMinor).toBe(0);
    });

    it('returns nothing for a customer when no document is reflected', () => {
        const result = buildOrderChanges(
            lines,
            [source({ reflectedInAccounting: false })],
            'customer',
        );
        expect(result.lines).toEqual([]);
    });

    it('attaches a product to its first order line only and skips unmatched products', () => {
        const result = buildOrderChanges(
            [...lines, { id: 3, productErpId: 'p-1', quantity: 2 }],
            [source({}), source({ productErpId: 'unknown' })],
            'staff',
        );
        expect(result.lines.map(l => l.orderLineId)).toEqual([1]);
    });

    it('counts service-line money for staff without producing a line event', () => {
        const result = buildOrderChanges(
            lines,
            [source({ productErpId: '', quantity: 0, amountMinor: -300 })],
            'staff',
        );
        expect(result.lines).toEqual([]);
        expect(result.amountDeltaMinor).toBe(-300);
    });
});

describe('sources', () => {
    it('adds the line VAT to amounts the ERP states without VAT', () => {
        const net = { number: '7', date: null, amountIncludesVat: false, accounting: {} };
        const claim = claimGoodsSource(
            net as never,
            { productId: 'p', quantity: 1, amountMinor: 100, vatAmountMinor: 20 } as never,
        );
        expect(claim.amountMinor).toBe(-120);
        const fix = correctionGoodsSource(
            net as never,
            {
                productId: 'p',
                quantity: 1,
                quantityBeforeCorrection: 2,
                amountMinor: 100,
                vatAmountMinor: 20,
                amountBeforeCorrectionMinor: 200,
                vatAmountBeforeCorrectionMinor: 40,
            } as never,
        );
        expect(fix.amountMinor).toBe(-120);
    });

    const doc = { number: '7', date: null, accounting: { reflectedInAccounting: true } };

    it('derives a correction delta from the old quantity, else from shippedDelta, in base units', () => {
        const line = (over: object): never =>
            ({
                productId: 'p-1',
                quantity: 3,
                quantityBeforeCorrection: 5,
                unitCoefficient: 2,
                amountMinor: 100,
                amountBeforeCorrectionMinor: 300,
                shippedDelta: -1,
                ...over,
            }) as never;
        expect(correctionGoodsSource(doc as never, line({})).quantity).toBe(-4);
        expect(correctionGoodsSource(doc as never, line({})).amountMinor).toBe(-200);
        expect(
            correctionGoodsSource(doc as never, line({ quantityBeforeCorrection: null })).quantity,
        ).toBe(-2);
    });

    it('never marks a claim as reflected in accounting', () => {
        const s = claimGoodsSource(
            { number: '9', date: null } as never,
            { productId: 'p-1', quantity: 2, unitCoefficient: null, amountMinor: 50 } as never,
        );
        expect([s.kind, s.quantity, s.amountMinor, s.reflectedInAccounting]).toEqual([
            'return',
            -2,
            -50,
            false,
        ]);
    });
});

describe('order line change resolvers', () => {
    const ctx = {} as RequestContext;
    const order = { id: 1, totalWithTax: 10000 } as never;
    const changes = { lines: [{ orderLineId: 1 }], amountDeltaMinor: -2500 };

    it('the shop resolver asks for the customer audience and returns lines only', async () => {
        const forOrder = vi.fn().mockResolvedValue(changes);
        const result = await new ShopOrderLineChangesResolver({ forOrder } as never).lineChanges(
            ctx,
            order,
        );
        expect(forOrder).toHaveBeenCalledWith(ctx, order, 'customer');
        expect(result).toEqual(changes.lines);
    });

    it('the admin resolver reduces the total, never below zero, and is null without changes', async () => {
        const forOrder = vi.fn().mockResolvedValue(changes);
        const resolver = new AdminOrderLineChangesResolver({ forOrder } as never);
        expect(await resolver.soldTotalWithTax(ctx, order)).toBe(7500);
        forOrder.mockResolvedValue({ lines: [], amountDeltaMinor: -99999 });
        expect(await resolver.soldTotalWithTax(ctx, { ...order })).toBe(0);
        forOrder.mockResolvedValue({ lines: [], amountDeltaMinor: 0 });
        expect(await resolver.soldTotalWithTax(ctx, { ...order })).toBeNull();
    });

    it('computes once per order when both admin fields are read', async () => {
        const forOrder = vi.fn().mockResolvedValue(changes);
        const resolver = new AdminOrderLineChangesResolver({ forOrder } as never);
        await resolver.lineChanges(ctx, order);
        await resolver.soldTotalWithTax(ctx, order);
        expect(forOrder).toHaveBeenCalledTimes(1);
        await resolver.lineChanges(ctx, { id: 2, totalWithTax: 1 } as never);
        expect(forOrder).toHaveBeenCalledTimes(2);
    });
});
