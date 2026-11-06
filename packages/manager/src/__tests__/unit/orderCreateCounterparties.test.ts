import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));

import { PORTAL_NOT_ACTIVATED_REASON, searchCustomerOptions } from '../../api/orderCreate';

const point = (id: string, isActive: boolean, customerStatus: string) => ({
    id,
    name: `point-${id}`,
    address: 'branch-a',
    isActive,
    customerStatus,
});

describe('searchCustomerOptions', () => {
    beforeEach(() => adminApi.mockReset());

    it('searches on the server with the trimmed term and no client filtering', async () => {
        adminApi.mockResolvedValue({ counterparties: { items: [] } });
        await searchCustomerOptions('  customer-123 ');
        expect(adminApi.mock.calls[0][1]).toEqual({ search: 'customer-123' });
    });

    it('does not query for a blank term', async () => {
        expect(await searchCustomerOptions('   ')).toEqual([]);
        expect(adminApi).not.toHaveBeenCalled();
    });

    it('keeps a counterparty without a customer (not selectable) and filters delivery points', async () => {
        adminApi.mockResolvedValue({
            counterparties: {
                items: [
                    {
                        id: '10',
                        shortName: 'customer-123',
                        legalName: 'customer-123 LLC',
                        inn: null,
                        priceType: null,
                        linkedCustomerId: null,
                        tradingPoints: [point('1', true, 'active'), point('2', false, 'active')],
                    },
                ],
            },
        });
        const [option] = await searchCustomerOptions('customer');
        expect(option.customerId).toBeNull();
        expect(option.tradingPoints.map(p => p.id)).toEqual(['1']);
        expect(PORTAL_NOT_ACTIVATED_REASON).toBe('Portal access not activated');
    });
});
