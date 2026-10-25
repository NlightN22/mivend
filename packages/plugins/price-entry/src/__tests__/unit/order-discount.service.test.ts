import { describe, expect, it, vi } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';

import { LookupMemo } from '../../lookup-memo';
import { OrderDiscountService } from '../../order-discount.service';
import type { PriceResolutionService } from '../../price-resolution.service';

const ctx = {} as RequestContext;

interface FakeLine {
    id: string;
    productVariantId: string;
    quantity: number;
    listPrice: number;
    linePriceWithTax: number;
    customFields?: { manualUnitPrice?: number | null };
}

function line(
    id: string,
    listPrice: number,
    quantity = 1,
    extra: Partial<FakeLine> = {},
): FakeLine {
    return {
        id,
        productVariantId: `v-${id}`,
        quantity,
        listPrice,
        linePriceWithTax: listPrice * quantity,
        ...extra,
    };
}

function orderOf(...lines: FakeLine[]): Order {
    return { lines, customerId: 'cust-1', customFields: {} } as unknown as Order;
}

function setup(customerPriceByVariant: Record<string, number | null>) {
    const resolve = vi.fn(async (_ctx: RequestContext, variantId: string) => ({
        customerPrice: customerPriceByVariant[variantId] ?? null,
        compareAtPrice: null,
    }));
    const preload = vi.fn(async () => undefined);
    const service = new OrderDiscountService({
        resolve,
        preload,
    } as unknown as PriceResolutionService);
    return { service, resolve };
}

describe('OrderDiscountService', () => {
    it('discounts each line by listPrice minus the best price, per unit', async () => {
        const { service } = setup({ 'v-a': 800, 'v-b': 1000 });
        const state = await service.stateFor(ctx, orderOf(line('a', 1000, 3), line('b', 1000)));
        expect(state).toEqual(new Map([['a', 200]]));
    });

    it('adjusts a marked-up line by a negative per-unit amount, no clamping', async () => {
        const { service } = setup({ 'v-a': 1050, 'v-b': null, 'v-c': 1000 });
        const state = await service.stateFor(
            ctx,
            orderOf(line('a', 1000, 2), line('b', 1000), line('c', 1000)),
        );
        expect(state).toEqual(new Map([['a', -50]]));
    });

    it('skips lines with a manual unit price', async () => {
        const { service, resolve } = setup({ 'v-a': 500 });
        const manual = line('a', 1000, 1, { customFields: { manualUnitPrice: 1000 } });
        const state = await service.stateFor(ctx, orderOf(manual));
        expect(state.size).toBe(0);
        expect(resolve).not.toHaveBeenCalled();
    });

    it('prices every line against the pre-promotion order total and the live quantities', async () => {
        const { service, resolve } = setup({ 'v-a': 900, 'v-b': 900 });
        const order = orderOf(line('a', 1000, 2), line('b', 1000, 3));
        await service.stateFor(ctx, order);
        const memo = { memo: expect.any(LookupMemo) };
        expect(resolve).toHaveBeenCalledWith(
            ctx,
            'v-a',
            { order, quantity: 2, documentAmount: 5000 },
            memo,
        );
        expect(resolve).toHaveBeenCalledWith(
            ctx,
            'v-b',
            { order, quantity: 3, documentAmount: 5000 },
            memo,
        );
    });

    it('computes once per order snapshot and again after a quantity change', async () => {
        const { service, resolve } = setup({ 'v-a': 900 });
        const order = orderOf(line('a', 1000, 1));
        await service.stateFor(ctx, order);
        await service.stateFor(ctx, order);
        await service.stateFor(ctx, order);
        expect(resolve).toHaveBeenCalledTimes(1);

        (order.lines[0] as unknown as FakeLine).quantity = 2;
        await service.stateFor(ctx, order);
        expect(resolve).toHaveBeenCalledTimes(2);
    });

    it('keeps two orders apart', async () => {
        const { service } = setup({ 'v-a': 900, 'v-b': 700 });
        const first = await service.stateFor(ctx, orderOf(line('a', 1000)));
        const second = await service.stateFor(ctx, orderOf(line('b', 1000)));
        expect([...first.keys()]).toEqual(['a']);
        expect([...second.keys()]).toEqual(['b']);
    });

    it('recomputes when the customer or the contract of the same order changes', async () => {
        const { service, resolve } = setup({ 'v-a': 900 });
        const order = orderOf(line('a', 1000));
        await service.stateFor(ctx, order);

        (order as unknown as { customerId: string }).customerId = 'cust-2';
        await service.stateFor(ctx, order);
        expect(resolve).toHaveBeenCalledTimes(2);

        (order as unknown as { customFields: object }).customFields = { erpContractId: 'ctr-9' };
        await service.stateFor(ctx, order);
        expect(resolve).toHaveBeenCalledTimes(3);
    });

    it('lets a manual-price line count toward its siblings tiers while getting no discount itself', async () => {
        const { service, resolve } = setup({ 'v-b': 900 });
        const manual = line('a', 1000, 4, { customFields: { manualUnitPrice: 1000 } });
        const sibling = line('b', 1000);
        const order = orderOf(manual, sibling);
        const state = await service.stateFor(ctx, order);
        expect(state).toEqual(new Map([['b', 100]]));
        const passedOrder = (resolve.mock.calls[0] as unknown[])[2] as { order: Order };
        expect(passedOrder.order.lines).toContain(manual);
    });
});
