import { describe, expect, it, vi } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';

import {
    HIDDEN_CATEGORY_LINES_MESSAGE,
    HiddenCategoryOrderProcess,
} from '../../hidden-category-order.process';

const shopCtx = { apiType: 'shop' } as unknown as RequestContext;
const adminCtx = { apiType: 'admin' } as unknown as RequestContext;

let orderProcess: HiddenCategoryOrderProcess;

function setup(hiddenProductIds: number[]): ReturnType<typeof vi.fn> {
    const query = vi.fn().mockResolvedValue([{ productId: 5 }]);
    const hidden = {
        hiddenProductIds: vi.fn().mockResolvedValue(new Set(hiddenProductIds.map(String))),
    };
    orderProcess = new HiddenCategoryOrderProcess();
    orderProcess.init({
        get: (token: { name: string }) =>
            token.name === 'HiddenCategoryProductsService'
                ? hidden
                : { getRepository: () => ({ query }) },
    } as unknown as Injector);
    return query;
}

const run = (from: string, to: string, ctx: RequestContext) =>
    orderProcess.onTransitionStart(from as never, to as never, {
        ctx,
        order: { id: 1 } as Order,
    });

describe('hiddenCategoryOrderProcess', () => {
    it('refuses placement and payment of a cart with a hidden-category line', async () => {
        setup([5]);
        expect(await run('AddingItems', 'ArrangingPayment', shopCtx)).toBe(
            HIDDEN_CATEGORY_LINES_MESSAGE,
        );
        expect(await run('ArrangingPayment', 'PaymentSettled', shopCtx)).toBe(
            HIDDEN_CATEGORY_LINES_MESSAGE,
        );
    });

    it('lets a cart of visible lines through and does not look at other transitions', async () => {
        const query = setup([]);
        expect(await run('AddingItems', 'ArrangingPayment', shopCtx)).toBeUndefined();
        query.mockClear();
        expect(await run('ArrangingPayment', 'AddingItems', shopCtx)).toBeUndefined();
        expect(query).not.toHaveBeenCalled();
    });

    it('leaves staff transitions alone', async () => {
        const query = setup([5]);
        expect(await run('Draft', 'ArrangingPayment', adminCtx)).toBeUndefined();
        expect(query).not.toHaveBeenCalled();
    });
});
