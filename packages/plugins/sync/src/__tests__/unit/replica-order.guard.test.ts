import { describe, expect, it } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';

import { ReplicaOrderInterceptor, ReplicaOrderProcess } from '../../replica-order.guard';

function makeOrder(sourceOrderId: string | null): Order {
    return { customFields: { sourceOrderId } } as unknown as Order;
}

function makeCtx(activeUserId: string | undefined): RequestContext {
    return { activeUserId } as unknown as RequestContext;
}

describe('ReplicaOrderInterceptor', () => {
    const interceptor = new ReplicaOrderInterceptor();

    it('blocks willAddItemToOrder on a replica when a real user is acting', () => {
        const result = interceptor.willAddItemToOrder(
            makeCtx('user-1'),
            makeOrder('central-order-9'),
            {} as never,
        );
        expect(result).toMatch(/managed there/);
    });

    it('blocks willAdjustOrderLine on a replica when a real user is acting', () => {
        const result = interceptor.willAdjustOrderLine(
            makeCtx('user-1'),
            makeOrder('central-order-9'),
            {} as never,
        );
        expect(result).toMatch(/managed there/);
    });

    it('blocks willRemoveItemFromOrder on a replica when a real user is acting', () => {
        const result = interceptor.willRemoveItemFromOrder(
            makeCtx('user-1'),
            makeOrder('central-order-9'),
            {} as never,
        );
        expect(result).toMatch(/managed there/);
    });

    it('allows edits on a replica from the sync-internal system context (no activeUserId)', () => {
        const result = interceptor.willAddItemToOrder(
            makeCtx(undefined),
            makeOrder('central-order-9'),
            {} as never,
        );
        expect(result).toBeUndefined();
    });

    it('allows edits on a non-replica order from a real user', () => {
        const result = interceptor.willAddItemToOrder(
            makeCtx('user-1'),
            makeOrder(null),
            {} as never,
        );
        expect(result).toBeUndefined();
    });
});

describe('ReplicaOrderProcess', () => {
    const process = new ReplicaOrderProcess();

    it('blocks a state transition on a replica when a real user is acting', () => {
        const result = process.onTransitionStart!('ArrangingPayment', 'PaymentAuthorized', {
            ctx: makeCtx('user-1'),
            order: makeOrder('central-order-9'),
        });
        expect(result).toMatch(/managed there/);
    });

    it('allows the sync path (no activeUserId) to transition a replica', () => {
        const result = process.onTransitionStart!('AddingItems', 'ArrangingPayment', {
            ctx: makeCtx(undefined),
            order: makeOrder('central-order-9'),
        });
        expect(result).toBeUndefined();
    });

    it('allows a real user to transition a non-replica order', () => {
        const result = process.onTransitionStart!('AddingItems', 'ArrangingPayment', {
            ctx: makeCtx('user-1'),
            order: makeOrder(null),
        });
        expect(result).toBeUndefined();
    });
});
