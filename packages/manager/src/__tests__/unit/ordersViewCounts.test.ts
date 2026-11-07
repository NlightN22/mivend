import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));

import { fetchOrdersViewCounts } from '../../api/orders-counts';

const NOW = new Date('2026-11-07T12:00:00Z');
const total = (n: number) => ({ totalItems: n });

describe('fetchOrdersViewCounts', () => {
    beforeEach(() => {
        adminApi.mockReset();
        adminApi.mockResolvedValue({
            all: total(100),
            awaitingConfirmation: total(7),
            processing: total(2),
            awaitingShipment: total(5),
            rejectedByErp: total(1),
            reservationFailed: total(3),
            erpRequirements: total(4),
            overdue: total(6),
            ordersAttention: { pendingPriceAdjustmentOrderIds: ['5', '8'] },
        });
    });

    it('asks every chip filter from the list builder in one request and maps the counts', async () => {
        const result = await fetchOrdersViewCounts('customer-123', ['REJECTED'], NOW);
        expect(adminApi).toHaveBeenCalledTimes(1);
        const vars = adminApi.mock.calls[0][1];
        expect(vars).toMatchObject({
            customerId: 'customer-123',
            awaitingConfirmation: { reservationState: { eq: 'AWAITING_CONFIRMATION' } },
            processing: { state: { eq: 'PaymentAuthorized' } },
            rejectedByErp: { erpStatus: { in: ['REJECTED'] } },
            overdue: { state: { eq: 'PaymentSettled' } },
        });
        expect(result.counts['awaiting-confirmation']).toBe(7);
        expect(result.counts.all).toBe(100);
        expect(result.pendingApprovalOrderIds).toEqual(new Set(['5', '8']));
    });
});
