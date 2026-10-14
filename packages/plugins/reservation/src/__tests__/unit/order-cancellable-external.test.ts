import { testOrderStatusDictionary } from '@mivend/plugin-erp-order';
import { describe, expect, it, vi } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';

import { OrderCancellableResolver } from '../../order-cancellable.resolver';

describe('OrderCancellableResolver for external orders', () => {
    it('is never cancellable and does not read payments', async () => {
        const find = vi.fn();
        const resolver = new OrderCancellableResolver(
            { getRepository: () => ({ find }) } as never,
            { dictionary: async () => testOrderStatusDictionary() } as never,
        );
        const order = {
            state: 'PaymentAuthorized',
            customFields: { isExternal: true },
        } as unknown as Order;

        expect(await resolver.cancellable({} as RequestContext, order)).toBe(false);
        expect(find).not.toHaveBeenCalled();
    });
});
