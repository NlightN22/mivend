import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));

import { BLANK_ORDERS_FILTERS } from '../../api/orders-list';
import { countsQueryVariables, fetchOrdersViewCounts } from '../../api/orders-counts';

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
        const result = await fetchOrdersViewCounts(
            BLANK_ORDERS_FILTERS,
            'customer-123',
            ['REJECTED'],
            NOW,
        );
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

    it('sends no filter for the All chip when nothing is selected', async () => {
        await fetchOrdersViewCounts(BLANK_ORDERS_FILTERS, undefined, [], NOW);
        expect(adminApi.mock.calls[0][1].all).toBeUndefined();
    });
});

describe('countsQueryVariables', () => {
    const conditions = [{ columnKey: 'total', operator: 'gt' as const, value: '10' }];
    const withFilters = {
        ...BLANK_ORDERS_FILTERS,
        search: '1001',
        view: 'processing' as const,
        conditions,
    };

    it('applies search and conditions to every chip, including All', () => {
        const vars = countsQueryVariables(withFilters, undefined, ['REJECTED'], NOW);
        expect(vars.search).toBe('1001');
        expect(vars.all).toEqual({ totalWithTax: { gt: 1000 } });
        expect(vars.awaitingShipment).toEqual({
            totalWithTax: { gt: 1000 },
            state: { eq: 'PaymentSettled' },
        });
        expect(vars.rejectedByErp).toEqual({
            totalWithTax: { gt: 1000 },
            erpStatus: { in: ['REJECTED'] },
        });
    });

    it('lets a chip replace the selected view instead of stacking with it', () => {
        const vars = countsQueryVariables(withFilters, undefined, [], NOW);
        expect(vars.awaitingShipment).not.toHaveProperty('_and');
        expect(vars.awaitingShipment).toMatchObject({ state: { eq: 'PaymentSettled' } });
        expect(vars.processing).toEqual({
            totalWithTax: { gt: 1000 },
            state: { eq: 'PaymentAuthorized' },
        });
    });

    it('passes the manager condition as the argument shared by all chips', () => {
        const vars = countsQueryVariables(
            {
                ...BLANK_ORDERS_FILTERS,
                conditions: [{ columnKey: 'manager', operator: 'eq', value: 'manager-1' }],
            },
            undefined,
            [],
            NOW,
        );
        expect(vars.managerId).toBe('manager-1');
        expect(vars.all).toBeUndefined();
    });
});
