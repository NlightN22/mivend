import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Injector, ProductVariant, RequestContext } from '@vendure/core';

import { MultiplicityOrderInterceptor } from '../../multiplicity-order.interceptor';

function createVariant(multiplicity: number | null | undefined): ProductVariant {
    return { customFields: { multiplicity } } as unknown as ProductVariant;
}

describe('MultiplicityOrderInterceptor', () => {
    let interceptor: MultiplicityOrderInterceptor;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        interceptor = new MultiplicityOrderInterceptor();
        // init() only needs injector.get() to resolve some object with hydrate()/translate() —
        // exact token matching isn't under test here, just that valid/invalid quantities are
        // judged correctly.
        interceptor.init({
            get: () => ({
                hydrate: vi.fn(async () => undefined),
                translate: vi.fn(() => ({ name: 'Test Variant' })),
            }),
        } as unknown as Injector);
    });

    it('passes a quantity that is a multiple of multiplicity', async () => {
        const result = await interceptor.willAddItemToOrder(ctx, {} as never, {
            productVariant: createVariant(4),
            quantity: 8,
        });
        expect(result).toBeUndefined();
    });

    it('rejects a quantity that is not a multiple of multiplicity', async () => {
        const result = await interceptor.willAddItemToOrder(ctx, {} as never, {
            productVariant: createVariant(4),
            quantity: 5,
        });
        expect(result).toContain('multiples of 4');
    });

    it.each([null, undefined, 0, -1, 1])(
        'treats multiplicity=%s as no constraint',
        async multiplicity => {
            const result = await interceptor.willAddItemToOrder(ctx, {} as never, {
                productVariant: createVariant(multiplicity),
                quantity: 7,
            });
            expect(result).toBeUndefined();
        },
    );

    it('applies the same check to willAdjustOrderLine', async () => {
        const result = await interceptor.willAdjustOrderLine(ctx, {} as never, {
            orderLine: { productVariant: createVariant(3) } as never,
            quantity: 4,
        });
        expect(result).toContain('multiples of 3');
    });
});
