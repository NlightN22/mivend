import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));

import { fetchOrdersSummary } from '../../api/orders';

const order = (id: string, state: string) => ({
    id,
    code: id,
    state,
    orderPlacedAt: null,
    customer: { firstName: 'A', lastName: 'B' },
});

describe('fetchOrdersSummary', () => {
    beforeEach(() => adminApi.mockReset());

    it('takes counts and amounts from the server and counts attention orders once', async () => {
        adminApi.mockResolvedValueOnce({
            open: { totalItems: 9000 },
            overdue: { totalItems: 700 },
            today: { totalItems: 600 },
            todayAmount: 123456789012,
            openAmount: 987654321098,
            processing: { totalItems: 1 },
            drafts: { totalItems: 2 },
            ordersAttention: {
                pendingPriceAdjustmentOrderIds: ['1', '2'],
                waiting: {
                    totalItems: 2,
                    items: [order('1', 'PaymentSettled'), order('2', 'X')],
                },
                overdueRows: {
                    items: [order('1', 'PaymentSettled'), order('3', 'PaymentSettled')],
                },
                both: { totalItems: 1 },
            },
        });

        const s = await fetchOrdersSummary();

        expect(s.openCount).toBe(9000);
        expect(s.todayAmount).toBe(123456789012);
        expect(s.totalAmount).toBe(987654321098);
        expect(s.waitingApprovalCount).toBe(2);
        expect(s.attentionCount).toBe(2 + 700 - 1);
        expect(s.attentionCandidates.map(c => c.id)).toEqual(['1', '2', '3']);
        expect(adminApi).toHaveBeenCalledTimes(1);
        expect([...s.pendingApprovalOrderIds]).toEqual(['1', '2']);
    });
});
