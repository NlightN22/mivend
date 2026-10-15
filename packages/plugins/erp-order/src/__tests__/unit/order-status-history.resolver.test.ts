import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderStatusHistoryResolver } from '../../order-status-history.resolver';
import { OrderStatusDictionary } from '../../order-status-dictionary';
import { testOrderStatusDictionary } from '../../testing/order-status-fixture';

const ctx = {} as RequestContext;

function resolver(statuses: string[], hidden: string[] = []): OrderStatusHistoryResolver {
    const base = testOrderStatusDictionary();
    const entries = base.entries.map(e =>
        hidden.includes(e.code) ? { ...e, customerVisible: false } : e,
    );
    const history = {
        list: vi.fn().mockResolvedValue(statuses.map(status => ({ status }))),
    };
    return new OrderStatusHistoryResolver(
        history as never,
        {
            dictionary: async () => new OrderStatusDictionary(entries),
        } as never,
    );
}

describe('OrderStatusHistoryResolver', () => {
    it('hides statuses marked not customer-visible', async () => {
        const result = await resolver(['UNDER_APPROVAL', 'PICKING'], ['PICKING']).statusHistory(
            ctx,
            { id: 1 } as never,
        );
        expect(result.map(e => e.status)).toEqual(['UNDER_APPROVAL']);
    });

    it('hides statuses missing from the dictionary', async () => {
        const result = await resolver(['UNDER_APPROVAL', 'UNKNOWN_CODE']).statusHistory(ctx, {
            id: 1,
        } as never);
        expect(result.map(e => e.status)).toEqual(['UNDER_APPROVAL']);
    });
});
