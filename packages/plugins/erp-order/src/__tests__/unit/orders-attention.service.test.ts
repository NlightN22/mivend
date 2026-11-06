import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { OrdersAttentionService } from '../../orders-attention.service';

const ctx = {} as RequestContext;
const overdueBefore = new Date('2026-01-01T00:00:00Z');

describe('OrdersAttentionService', () => {
    it('filters waiting and both by the pending ids and returns them with the lists', async () => {
        const findVisible = vi.fn().mockResolvedValue({ items: [], totalItems: 3 });
        const approvals = { findPendingPriceAdjustmentOrderIds: vi.fn().mockResolvedValue(['7']) };
        const service = new OrdersAttentionService({ findVisible } as never, approvals as never);

        const result = await service.load(ctx, overdueBefore);

        expect(result.pendingPriceAdjustmentOrderIds).toEqual(['7']);
        expect(result.both).toEqual({ totalItems: 3 });
        const filters = findVisible.mock.calls.map(c => c[1].filter);
        expect(filters.filter(f => f.id?.in?.[0] === '7')).toHaveLength(2);
        expect(filters.find(f => !f.id)).toMatchObject({ state: { eq: 'PaymentSettled' } });
    });

    it('applies no id match when nothing is pending', async () => {
        const findVisible = vi.fn().mockResolvedValue({ items: [], totalItems: 0 });
        const approvals = { findPendingPriceAdjustmentOrderIds: vi.fn().mockResolvedValue([]) };
        const service = new OrdersAttentionService({ findVisible } as never, approvals as never);

        const result = await service.load(ctx, overdueBefore);

        expect(result.waiting.totalItems).toBe(0);
        expect(findVisible.mock.calls[0][1].filter.id).toEqual({ in: [] });
    });
});
