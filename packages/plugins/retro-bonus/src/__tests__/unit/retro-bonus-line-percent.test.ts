import { describe, expect, it } from 'vitest';

import { lineRetroBonus } from '../../retro-bonus-line-percent';
import { RetroBonusOrderResolver } from '../../retro-bonus-order.resolver';

const NOW = new Date('2026-11-10T00:00:00Z');
const rule = (over: Record<string, unknown> = {}) => ({
    percent: 3,
    allProducts: false,
    productMode: 'list',
    inactiveReason: null,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: null,
    conditionAmount: null,
    conditionQuantity: null,
    ...over,
});
const line = { orderLineId: '7', productErpId: 'p1', lineTotal: 20000 };
const members = (ids: string[]) => () => new Set(ids);

describe('lineRetroBonus', () => {
    it('gives the percent and the amount of the line total for a listed product', () => {
        expect(lineRetroBonus([rule()], members(['p1']), line, NOW)).toEqual({
            orderLineId: '7',
            percent: 3,
            amount: 600,
        });
    });

    it('says nothing for a product outside the list or behind an unevaluated filter', () => {
        expect(lineRetroBonus([rule()], members(['p2']), line, NOW)).toBeNull();
        expect(
            lineRetroBonus([rule({ productMode: 'filter' })], members(['p1']), line, NOW),
        ).toBeNull();
        expect(
            lineRetroBonus([rule({ inactiveReason: 'product-x' })], members(['p1']), line, NOW),
        ).toBeNull();
    });

    it('covers every product for an all-products rule and honours the validity period', () => {
        expect(lineRetroBonus([rule({ allProducts: true })], members([]), line, NOW)?.percent).toBe(
            3,
        );
        expect(
            lineRetroBonus(
                [rule({ allProducts: true, validTo: new Date('2026-06-01T00:00:00Z') })],
                members([]),
                line,
                NOW,
            ),
        ).toBeNull();
    });

    it('takes the deepest percent and leaves the amount out under a threshold', () => {
        const rules = [rule({ percent: 2 }), rule({ percent: 5, conditionAmount: 1000 })];
        expect(lineRetroBonus(rules, members(['p1']), line, NOW)).toEqual({
            orderLineId: '7',
            percent: 5,
            amount: null,
        });
    });
});

describe('RetroBonusOrderResolver', () => {
    it('answers an empty result for an order the caller cannot see and never reads its lines', async () => {
        const resolver = new RetroBonusOrderResolver(
            {
                forOrder: async () => {
                    throw new Error('must not run');
                },
            } as never,
            { visibleIds: async () => new Set<string>() } as never,
        );
        expect(await resolver.orderRetroBonus({} as never, { orderId: '1' })).toEqual({
            hasRules: false,
            lines: [],
        });
    });
});
