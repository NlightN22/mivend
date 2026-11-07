import { describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError, PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { DiscountLimitResolver } from '../../discount-limit.resolver';

const proto = DiscountLimitResolver.prototype as unknown as Record<string, unknown>;
const allowed = (method: string): string[] =>
    Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto[method] as object) as string[];

describe('DiscountLimitResolver permissions', () => {
    it('limit management needs ManageDiscountLimits', () => {
        for (const m of ['discountLimits', 'setDiscountLimit', 'removeDiscountLimit']) {
            expect(allowed(m)).toEqual([CustomPermission.ManageDiscountLimits.Permission]);
        }
    });

    it('reducing, reverting and reading the ceilings need the price adjustment right', () => {
        for (const m of [
            'reduceOrderLineDiscount',
            'revertOrderLineDiscount',
            'orderLineDiscountLimits',
        ]) {
            expect(allowed(m)).toEqual([CustomPermission.AdjustPriceWithinLimit.Permission]);
        }
    });
});

describe('DiscountLimitResolver.orderLineDiscountLimits', () => {
    const ctx = {} as RequestContext;
    const build = (visible: string[]) =>
        new DiscountLimitResolver(
            { ceilingsForProducts: vi.fn(async () => new Map([['p1', 7]])) } as never,
            {
                forOrderId: vi.fn(async () => [{ lineId: '1', productErpId: 'p1', percent: 4 }]),
            } as never,
            {} as never,
            { getActorIdentity: async () => ({ roleCodes: ['manager'], branchId: null }) } as never,
            {
                visibleIds: async (_c: unknown, ids: string[]) =>
                    new Set(ids.filter(i => visible.includes(i))),
            } as never,
        );

    it('returns the current admin ceiling and the line discount percent', async () => {
        expect(await build(['9']).orderLineDiscountLimits(ctx, { orderId: '9' })).toEqual([
            { orderLineId: '1', maxDiscountPercent: 7, discountPercent: 4 },
        ]);
    });

    it('answers an order outside the actor scope like a missing one', async () => {
        await expect(
            build([]).orderLineDiscountLimits(ctx, { orderId: '9' }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
});
