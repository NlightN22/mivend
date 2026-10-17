import { describe, expect, it } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';

import { orderCheckFlagProcess } from '../../order-check-flag.process';

function run(storedFindings: number, order: Partial<Order>, toState: string): Promise<void> {
    const connection = { getRepository: () => ({ count: async () => storedFindings }) };
    orderCheckFlagProcess.init?.({
        get: (token: unknown) => (token === TransactionalConnection ? connection : undefined),
    } as unknown as Injector);
    return Promise.resolve(
        orderCheckFlagProcess.onTransitionEnd?.('ArrangingPayment', toState as never, {
            ctx: {} as RequestContext,
            order: order as Order,
        }),
    );
}

describe('orderCheckFlagProcess', () => {
    it('stamps the stored findings onto a stale in-memory order so the trailing save keeps them', async () => {
        const stale = { id: 1, customFields: { hasCheckFindings: false, other: 'kept' } };
        await run(2, stale as never, 'PaymentSettled');
        expect(stale.customFields).toEqual({ hasCheckFindings: true, other: 'kept' });
    });

    it('clears the flag when no findings are stored', async () => {
        const stale = { id: 1, customFields: { hasCheckFindings: true } };
        await run(0, stale as never, 'PaymentAuthorized');
        expect(stale.customFields.hasCheckFindings).toBe(false);
    });

    it('does not touch a cart order', async () => {
        const cart = { id: 1, customFields: { hasCheckFindings: false } };
        await run(3, cart as never, 'AddingItems');
        expect(cart.customFields.hasCheckFindings).toBe(false);
    });
});
