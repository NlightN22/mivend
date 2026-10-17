import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { withOrderCancelLocks } from '../../order-cancel-locks';

describe('withOrderCancelLocks', () => {
    it('takes the proforma lock, then the reserve lock, then runs the work', async () => {
        const order: string[] = [];
        const query = vi.fn(async (_sql: string, params: string[]) => {
            order.push(params[0]);
        });
        const connection = {
            withTransaction: vi.fn(
                async (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) => work(c),
            ),
            getRepository: vi.fn(() => ({ query })),
        };
        const result = await withOrderCancelLocks(
            connection as never,
            {} as RequestContext,
            7,
            async () => {
                order.push('work');
                return 'done';
            },
        );
        expect(result).toBe('done');
        expect(order).toEqual(['proformaInvoices-for-order:7', 'reserve-order:7', 'work']);
    });
});
