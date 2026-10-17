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

    it('keeps hidden statuses with their texts blanked, so list filters can still exclude them', async () => {
        const list = await resolver.orderStatuses({} as RequestContext);
        expect(list.find(s => s.code === 'UNDER_APPROVAL')?.customerVisible).toBe(true);
        expect(list.find(s => s.code === 'PICKING')).toMatchObject({
            customerVisible: false,
            name: 'PICKING',
            description: '',
        });
    });

    it('exposes no internal flags', async () => {
        const [first] = await resolver.orderStatuses({} as RequestContext);
        expect(Object.keys(first).sort()).toEqual([
            'cancelled',
            'code',
            'customerGroup',
            'customerVisible',
            'description',
            'name',
            'rejected',
            'terminal',
        ]);
    });
});
