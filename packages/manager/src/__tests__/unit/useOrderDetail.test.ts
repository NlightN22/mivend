import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchOrderDetail = vi.fn();
const fetchCredit = vi.fn();
vi.mock('../../api/orderDetail', () => ({
    fetchOrderDetail: (...a: unknown[]) => fetchOrderDetail(...a),
    fetchPriceAdjustmentRequestsForOrder: async () => [],
    fetchRelatedDocuments: async () => [],
}));
vi.mock('../../api/orders', () => ({
    fetchManagerOptions: async () => [{ id: '4', name: 'Pat Manager', email: '', roleCodes: [] }],
}));
vi.mock('../../api/customers', () => ({
    fetchCreditForCounterparty: (...a: unknown[]) => fetchCredit(...a),
}));
vi.mock('../../api/orderLineEdit', () => ({ fetchOrderLineShortfalls: async () => [] }));
vi.mock('../../api/reservation', () => ({ fetchOrderReservations: async () => [] }));
vi.mock('vue', async importOriginal => ({
    ...(await importOriginal<typeof import('vue')>()),
    onMounted: () => undefined,
}));

import { useOrderDetail } from '../../composables/useOrderDetail';

describe('useOrderDetail counterparty source', () => {
    beforeEach(() => {
        fetchOrderDetail.mockReset();
        fetchCredit.mockReset().mockResolvedValue(null);
    });

    it('takes manager and credit lookup from the order counterparty, with no customer person', async () => {
        fetchOrderDetail.mockResolvedValue({
            id: '1',
            code: 'order-1',
            customer: null,
            counterparty: { id: '9', assignedManagerId: '4' },
        });
        const detail = useOrderDetail(() => 'order-1');
        await detail.load();
        expect(detail.managerName.value).toBe('Pat Manager');
        expect(fetchCredit).toHaveBeenCalledWith('9');
    });

    it('skips the credit lookup when the order has no counterparty', async () => {
        fetchOrderDetail.mockResolvedValue({
            id: '2',
            code: 'order-2',
            customer: null,
            counterparty: null,
        });
        const detail = useOrderDetail(() => 'order-2');
        await detail.load();
        expect(detail.managerName.value).toBeNull();
        expect(fetchCredit).not.toHaveBeenCalled();
    });
});
