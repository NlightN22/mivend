import { describe, it, expect, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';

import { OrderDiscountLimitCheck } from '../../order-discount-limit.check';
import { PriceAdjustmentLimitCheck } from '../../price-adjustment-limit.check';
import { PriceAdjustmentAutomaticCheck } from '../../price-adjustment-automatic.check';
import type { DiscountLimitService } from '../../discount-limit.service';
import type { LineDiscountService } from '../../line-discount.service';

const ctx = {} as RequestContext;

function orderCheck(administratorId: string | null, ceiling: number | null) {
    return new OrderDiscountLimitCheck(
        new CheckRegistry(),
        {
            actorAdministratorId: async () => administratorId,
            ceilingsForProducts: vi.fn(async () => new Map([['p1', ceiling]])),
        } as unknown as DiscountLimitService,
        {
            forOrderId: vi.fn(async () => [
                { lineId: '1', productErpId: 'p1', percent: 12.5 },
                { lineId: '2', productErpId: 'p1', percent: 4 },
                { lineId: '3', productErpId: 'p1', percent: null },
                { lineId: '4', productErpId: 'p1', percent: -3 },
            ]),
        } as unknown as LineDiscountService,
    );
}

const orderRun = (check: OrderDiscountLimitCheck) =>
    check.evaluate({ orderId: '9' }, { ctx, stage: 'on-edit', recipient: null });

describe('OrderDiscountLimitCheck', () => {
    it('flags only the lines above the limit, with the percent but never the limit', async () => {
        const findings = await orderRun(orderCheck('7', 10));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            lineRef: '1',
            facts: { reason: 'over-limit', discountPercent: 12.5 },
        });
        expect(JSON.stringify(findings)).not.toContain('"10"');
        expect(Object.keys(findings[0].facts)).not.toContain('limit');
    });

    it('never flags a surcharge (negative discount), which has no limit', async () => {
        const findings = await orderRun(orderCheck('7', 0));
        expect(findings.map(f => f.lineRef)).toEqual(['1', '2']);
    });

    it('gives no finding when no limit is set (fail-open, owner decision)', async () => {
        expect(await orderRun(orderCheck('7', null))).toEqual([]);
    });

    it('gives no finding without an administrator', async () => {
        expect(await orderRun(orderCheck(null, 1))).toEqual([]);
    });

    it('is registered for pre-reserve and on-edit, default warn', () => {
        const registry = new CheckRegistry();
        new OrderDiscountLimitCheck(registry, {} as never, {} as never).onModuleInit();
        const def = registry.getCheck('order.discount-over-limit');
        expect(def?.stages).toEqual(['pre-reserve', 'on-edit']);
        expect(def?.defaultConsequence).toBe('warn');
    });
});

function managerRun(
    params: { requestedPrice: number; referencePrice: number | null; direction: string },
    ceiling: number | null,
    administratorId: string | null = '7',
) {
    const check = new PriceAdjustmentLimitCheck(
        new CheckRegistry(),
        {
            getRepository: () => ({
                findOne: async () => ({ product: { customFields: { externalId: 'p1' } } }),
            }),
        } as unknown as TransactionalConnection,
        {
            actorAdministratorId: async () => administratorId,
            ceilingsForProducts: vi.fn(async () => new Map([['p1', ceiling]])),
        } as unknown as DiscountLimitService,
    );
    return check.evaluate(
        {
            roleCodes: [],
            branchId: null,
            params: {
                variantId: 'v1',
                hasAutomaticDiscount: false,
                ...params,
                direction: params.direction as never,
            },
        },
        { ctx, stage: 'adjust-price', recipient: null },
    );
}

describe('PriceAdjustmentLimitCheck', () => {
    it('flags a request that deepens the discount past the limit', async () => {
        const findings = await managerRun(
            { requestedPrice: 80, referencePrice: 100, direction: 'increases-discount' },
            10,
        );
        expect(findings).toHaveLength(1);
        expect(findings[0].facts).toEqual({
            variantId: 'v1',
            reason: 'over-limit',
            impliedDiscountPercent: 20,
        });
    });

    it('passes a deepening within the limit', async () => {
        expect(
            await managerRun(
                { requestedPrice: 90, referencePrice: 100, direction: 'increases-discount' },
                10,
            ),
        ).toEqual([]);
    });

    it('does not flag a request that reduces or keeps the discount, even above the limit', async () => {
        for (const direction of ['reduces-discount', 'unchanged']) {
            expect(
                await managerRun({ requestedPrice: 70, referencePrice: 100, direction }, 10),
            ).toEqual([]);
        }
    });

    it('gives no finding when no limit is set, the reference is unknown or the actor is no administrator', async () => {
        const deep = { requestedPrice: 1, referencePrice: 100, direction: 'increases-discount' };
        expect(await managerRun(deep, null)).toEqual([]);
        expect(await managerRun({ ...deep, referencePrice: null }, 10)).toEqual([]);
        expect(await managerRun(deep, 10, null)).toEqual([]);
    });

    it('never flags a surcharge, whatever the limit', async () => {
        expect(
            await managerRun(
                { requestedPrice: 150, referencePrice: 100, direction: 'increases-discount' },
                0,
            ),
        ).toEqual([]);
    });

    it('defaults to require-approval at adjust-price', () => {
        const registry = new CheckRegistry();
        new PriceAdjustmentLimitCheck(registry, {} as never, {} as never).onModuleInit();
        expect(
            registry.getCheck('manager.price-adjustment-discount-limit')?.defaultConsequence,
        ).toBe('require-approval');
    });
});

describe('PriceAdjustmentAutomaticCheck', () => {
    const run = (direction: string, hasAutomaticDiscount: boolean) =>
        new PriceAdjustmentAutomaticCheck(new CheckRegistry()).evaluate({
            roleCodes: [],
            branchId: null,
            params: {
                variantId: 'v1',
                requestedPrice: 50,
                referencePrice: 100,
                direction: direction as never,
                hasAutomaticDiscount,
            },
        });

    it('flags only a deepening on a line that has an automatic discount', () => {
        expect(run('increases-discount', true)).toHaveLength(1);
        expect(run('increases-discount', false)).toEqual([]);
        expect(run('reduces-discount', true)).toEqual([]);
    });

    it('defaults to block at adjust-price', () => {
        const registry = new CheckRegistry();
        new PriceAdjustmentAutomaticCheck(registry).onModuleInit();
        const def = registry.getCheck('manager.price-adjustment-automatic-discount');
        expect(def?.stages).toEqual(['adjust-price']);
        expect(def?.defaultConsequence).toBe('block');
    });
});
