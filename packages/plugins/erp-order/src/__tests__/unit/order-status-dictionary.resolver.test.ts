import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ShopOrderStatusDictionaryResolver } from '../../order-status-dictionary.resolver';
import { OrderStatusDictionary } from '../../order-status-dictionary';
import { testOrderStatusDictionary } from '../../testing/order-status-fixture';

describe('ShopOrderStatusDictionaryResolver', () => {
    const entries = testOrderStatusDictionary().entries.map(e =>
        e.code === 'PICKING' ? { ...e, customerVisible: false } : e,
    );
    const resolver = new ShopOrderStatusDictionaryResolver({
        dictionary: async () => new OrderStatusDictionary(entries),
    } as never);

    it('returns only customer-visible statuses', async () => {
        const codes = (await resolver.orderStatuses({} as RequestContext)).map(s => s.code);
        expect(codes).toContain('UNDER_APPROVAL');
        expect(codes).not.toContain('PICKING');
    });

    it('exposes no internal flags', async () => {
        const [first] = await resolver.orderStatuses({} as RequestContext);
        expect(Object.keys(first).sort()).toEqual([
            'cancelled',
            'code',
            'customerGroup',
            'description',
            'name',
            'rejected',
            'terminal',
        ]);
    });
});
