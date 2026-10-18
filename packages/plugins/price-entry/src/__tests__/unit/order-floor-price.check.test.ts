import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';

import { OrderFloorPriceCheck } from '../../order-floor-price.check';
import type { FloorPriceService } from '../../floor-price.service';

const ctx = {} as RequestContext;
const lines = [
    { lineId: '1', productVariantId: 'v1', sku: 'A' },
    { lineId: '2', productVariantId: 'v2', sku: 'B' },
];

function run(floors: Array<[string, number]>, prices: Array<[number, number]>) {
    const connection = {
        getRepository: () => ({
            findByIds: vi.fn(async () => prices.map(([id, listPrice]) => ({ id, listPrice }))),
        }),
    };
    const check = new OrderFloorPriceCheck(
        new CheckRegistry(),
        connection as never,
        { forVariants: vi.fn(async () => new Map(floors)) } as unknown as FloorPriceService,
    );
    return check.evaluate({ lines }, { ctx, stage: 'pre-reserve', recipient: null });
}

describe('OrderFloorPriceCheck', () => {
    it('passes at the floor and above', async () => {
        expect(
            await run(
                [
                    ['v1', 100],
                    ['v2', 50],
                ],
                [
                    [1, 100],
                    [2, 80],
                ],
            ),
        ).toEqual([]);
    });

    it('flags only the line below the floor, without revealing floor or price', async () => {
        const findings = await run(
            [
                ['v1', 100],
                ['v2', 50],
            ],
            [
                [1, 99],
                [2, 80],
            ],
        );
        expect(findings).toHaveLength(1);
        expect(findings[0].lineRef).toBe('1');
        expect(findings[0].facts).toEqual({ sku: 'A', reason: 'below-floor' });
        expect(JSON.stringify(findings)).not.toMatch(/\b(99|100)\b/);
    });

    it('does not flag a variant with no known floor', async () => {
        expect(
            await run(
                [],
                [
                    [1, 1],
                    [2, 1],
                ],
            ),
        ).toEqual([]);
        expect(
            await run(
                [['v2', 50]],
                [
                    [1, 1],
                    [2, 60],
                ],
            ),
        ).toEqual([]);
    });

    it('registers at pre-reserve and on-edit with a warn default', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType({
            type: 'order',
            stages: ['cart', 'checkout', 'pre-reserve', 'pre-send-to-erp', 'on-edit'],
            allowedConsequences: ['info', 'warn', 'hold'],
            loadSubject: async () => null,
            lockKey: id => id,
        } as never);
        new OrderFloorPriceCheck(registry, {} as never, {} as never).onModuleInit();
        const provider = registry.getCheck('order.below-floor-price')!;
        expect(provider.stages).toEqual(['pre-reserve', 'on-edit']);
        expect(registry.defaultConsequence(provider, 'pre-reserve')).toBe('warn');
    });
});
