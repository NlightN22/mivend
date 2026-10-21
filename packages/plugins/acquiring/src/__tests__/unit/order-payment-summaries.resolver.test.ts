import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { AdminPaymentVisibilityResolver } from '../../admin-payment-visibility.resolver';

describe('orderPaymentSummaries', () => {
    it('sums only visible orders and answers a hidden one like a missing one', async () => {
        const sum = vi.fn(async () => new Map([[1, 500]]));
        const resolver = new AdminPaymentVisibilityResolver(
            {} as never,
            { sumCapturedAmountsByOrderIds: sum } as never,
            { visibleIds: async () => new Set(['1']) } as never,
        );
        const result = await resolver.orderPaymentSummaries({} as RequestContext, {
            orderIds: ['1', '2'],
        });
        expect(sum).toHaveBeenCalledWith({}, [1]);
        expect(result).toEqual([
            { orderId: '1', capturedAmount: 500 },
            { orderId: '2', capturedAmount: 0 },
        ]);
    });
});
