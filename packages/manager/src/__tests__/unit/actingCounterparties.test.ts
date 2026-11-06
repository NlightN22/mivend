import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminApi = vi.fn();
vi.mock('../../api/client', () => ({ adminApi: (...a: unknown[]) => adminApi(...a) }));

import {
    PORTAL_NOT_ACTIVATED_REASON,
    actingStorefrontUrl,
    hasMoreCustomerMatches,
    searchCustomerOptions,
} from '../../api/actingSession';

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
        adminApi.mockResolvedValue({ counterparties: { totalItems: 0, items: [] } });
        await searchCustomerOptions('  customer-123 ');
        expect(adminApi.mock.calls[0][1]).toEqual({ search: 'customer-123' });
    });

    it('does not query for a blank term', async () => {
        expect(await searchCustomerOptions('   ')).toEqual({ items: [], totalItems: 0 });
        expect(adminApi).not.toHaveBeenCalled();
    });

    it('keeps a counterparty without a customer (not selectable) and filters delivery points', async () => {
        adminApi.mockResolvedValue({
            counterparties: {
                totalItems: 45,
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
        const {
            items: [option],
            totalItems,
        } = await searchCustomerOptions('customer');
        expect(totalItems).toBe(45);
        expect(option.customerId).toBeNull();
        expect(option.tradingPoints.map(p => p.id)).toEqual(['1']);
        expect(PORTAL_NOT_ACTIVATED_REASON).toBe('Portal access not activated');
    });

    it('asks to refine the search only when more matches exist than one page shows', () => {
        expect(hasMoreCustomerMatches(20)).toBe(false);
        expect(hasMoreCustomerMatches(21)).toBe(true);
    });
});

describe('actingStorefrontUrl', () => {
    it('puts the ticket in the fragment of the storefront acting route', () => {
        expect(actingStorefrontUrl('https://shop.example/', 'a b')).toBe(
            'https://shop.example/acting#ticket=a%20b',
        );
    });
});
