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

    it('keeps hidden statuses as code and terminal only, so list filters can still exclude them', async () => {
        const list = await resolver.orderStatuses({} as RequestContext);
        expect(list.find(s => s.code === 'UNDER_APPROVAL')?.customerVisible).toBe(true);
        const hidden = entries.find(e => e.code === 'PICKING')!;
        expect(list.find(s => s.code === 'PICKING')).toEqual({
            code: 'PICKING',
            name: '',
            description: '',
            customerGroup: '',
            terminal: hidden.terminal,
            cancelled: false,
            rejected: false,
            customerVisible: false,
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
