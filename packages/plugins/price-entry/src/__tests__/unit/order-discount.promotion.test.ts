import { describe, expect, it, vi } from 'vitest';
import type { Injector, Order, OrderLine, RequestContext } from '@vendure/core';

import {
    ORDER_DISCOUNT_CONDITION_CODE,
    orderDiscountAction,
    orderDiscountCondition,
} from '../../order-discount.promotion';
import type { OrderDiscountService } from '../../order-discount.service';

const ctx = {} as RequestContext;

async function initWith(discounts: Map<string, number>): Promise<void> {
    const service = { stateFor: vi.fn(async () => discounts) } as unknown as OrderDiscountService;
    await orderDiscountCondition.init({ get: () => service } as unknown as Injector);
}

function check(order: Partial<Order>): ReturnType<typeof orderDiscountCondition.check> {
    return orderDiscountCondition.check(ctx, order as Order, [], {} as never);
}

describe('order discount promotion', () => {
    it('does not apply when no line is discounted', async () => {
        await initWith(new Map());
        expect(await check({ lines: [] })).toBe(false);
    });

    it('passes the per-line state to the action', async () => {
        const discounts = new Map([['1', 150]]);
        await initWith(discounts);
        expect(await check({ lines: [] })).toEqual({ discounts });
    });

    it('never touches read-only ERP orders', async () => {
        await initWith(new Map([['1', 150]]));
        const order = { lines: [], customFields: { isExternal: true } };
        expect(await check(order as unknown as Partial<Order>)).toBe(false);
    });

    it('discounts a line by its own share only, as a negative amount', () => {
        const state = {
            [ORDER_DISCOUNT_CONDITION_CODE]: { discounts: new Map([['1', 150]]) },
        };
        const run = (id: string): number | Promise<number> =>
            orderDiscountAction.execute(
                ctx,
                { id } as unknown as OrderLine,
                [],
                state as never,
                {} as never,
            );
        expect(run('1')).toBe(-150);
        expect(run('2')).toBe(0);
    });

    it('turns a negative per-unit state into a positive adjustment (markup)', () => {
        const state = {
            [ORDER_DISCOUNT_CONDITION_CODE]: { discounts: new Map([['1', -50]]) },
        };
        const run = orderDiscountAction.execute(
            ctx,
            { id: '1' } as unknown as OrderLine,
            [],
            state as never,
            {} as never,
        );
        expect(run).toBe(50);
    });
});
