import { describe, expect, it } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';

import { AdminOrderStatusHistoryResolver } from '../../admin-order-status-history.resolver';

describe('AdminOrderStatusHistoryResolver', () => {
    it('returns every recorded status of the order, including ones hidden from customers', async () => {
        const entries = [{ status: 'internal-review' }, { status: 'accepted' }];
        const history = { list: async (_ctx: unknown, id: unknown) => (id === 7 ? entries : []) };
        const resolver = new AdminOrderStatusHistoryResolver(history as never);
        const result = await resolver.statusHistory({} as RequestContext, { id: 7 } as Order);
        expect(result).toEqual(entries);
    });
});
