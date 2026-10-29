import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PriceEntryService } from '../../price-entry.service';

const mockRawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn(() => ({ query: mockRawQuery })),
};

const mockCtx = {} as unknown as RequestContext;

describe('PriceEntryService', () => {
    let service: PriceEntryService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new PriceEntryService(mockConnection as unknown as TransactionalConnection);
    });

    describe('upsert (variant API)', () => {
        it('writes one atomic upsert keyed by the variant product ERP id and returns the entry', async () => {
            mockRawQuery.mockResolvedValue([{ id: 7 }]);

            const result = await service.upsert(mockCtx, '12', 'RETAIL', 1000);

            const [sql, params] = mockRawQuery.mock.calls[0];
            expect(sql).toContain('ON CONFLICT ("productExternalId", "priceTypeCode")');
            expect(params).toEqual(['12', 'RETAIL', 1000]);
            expect(result).toEqual({
                id: '7',
                variantId: '12',
                priceTypeCode: 'RETAIL',
                price: 1000,
            });
        });

        it('rejects a variant whose product has no ERP id', async () => {
            mockRawQuery.mockResolvedValue([]);

            await expect(service.upsert(mockCtx, '12', 'RETAIL', 1)).rejects.toThrow(
                'has no product ERP id',
            );
        });
    });

    describe('upsertByProduct / removeByProduct', () => {
        it('upserts by product ERP id without touching product tables', async () => {
            mockRawQuery.mockResolvedValue([]);

            await service.upsertByProduct(mockCtx, 'erp-1', 'RETAIL', 500);

            const [sql, params] = mockRawQuery.mock.calls[0];
            expect(sql).not.toContain('product_variant ');
            expect(params).toEqual(['erp-1', 'RETAIL', 500]);
        });

        it('reports whether a stored price was removed', async () => {
            mockRawQuery.mockResolvedValueOnce([{ n: 1 }]).mockResolvedValueOnce([{ n: 0 }]);

            expect(await service.removeByProduct(mockCtx, 'erp-1', 'RETAIL')).toBe(true);
            expect(await service.removeByProduct(mockCtx, 'erp-1', 'RETAIL')).toBe(false);
        });
    });

    describe('bulkUpsert', () => {
        it('returns 0 and skips DB for empty array', async () => {
            expect(await service.bulkUpsert(mockCtx, [])).toBe(0);
            expect(mockRawQuery).not.toHaveBeenCalled();
        });

        it('returns the number of stored entries', async () => {
            mockRawQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            const entries = [
                { variantId: '1', priceTypeCode: 'RETAIL', price: 100 },
                { variantId: '2', priceTypeCode: 'RETAIL', price: 200 },
            ];

            expect(await service.bulkUpsert(mockCtx, entries)).toBe(2);
            expect(mockRawQuery.mock.calls[0][1]).toEqual([
                ['1', '2'],
                ['RETAIL', 'RETAIL'],
                [100, 200],
            ]);
        });
    });

    describe('getForVariant', () => {
        it('returns numeric price when found', async () => {
            mockRawQuery.mockResolvedValue([{ price: '2500' }]);

            expect(await service.getForVariant(mockCtx, '1', 'RETAIL')).toBe(2500);
        });

        it('returns null when not found', async () => {
            mockRawQuery.mockResolvedValue([]);

            expect(await service.getForVariant(mockCtx, '1', 'RETAIL')).toBeNull();
        });
    });

    describe('getForVariants', () => {
        it('returns empty Map without DB call for empty ids', async () => {
            const result = await service.getForVariants(mockCtx, [], 'RETAIL');

            expect(result.size).toBe(0);
            expect(mockRawQuery).not.toHaveBeenCalled();
        });

        it('returns Map of variantId to price', async () => {
            mockRawQuery.mockResolvedValue([
                { variantId: 1, price: '100' },
                { variantId: 2, price: '200' },
            ]);

            const result = await service.getForVariants(mockCtx, ['1', '2'], 'RETAIL');

            expect(result.get('1')).toBe(100);
            expect(result.get('2')).toBe(200);
            expect(result.size).toBe(2);
        });
    });

    describe('getPriceTypeCodeForCustomer', () => {
        it('resolves the main contract price type first, scoped to the given customer', async () => {
            mockRawQuery.mockResolvedValue([{ code: 'WHOLESALE' }]);

            const result = await service.getPriceTypeCodeForCustomer(mockCtx, 'c1');

            expect(result).toBe('WHOLESALE');
            const [sql, params] = mockRawQuery.mock.calls[0];
            expect(params).toEqual(['c1']);
            expect(sql.indexOf('"mainContractId"')).toBeLessThan(
                sql.indexOf('customer_price_type'),
            );
        });

        it('returns null when neither main contract nor assignment resolves', async () => {
            mockRawQuery.mockResolvedValue([]);

            expect(await service.getPriceTypeCodeForCustomer(mockCtx, 'c2')).toBeNull();
        });
    });

    describe('getPriceTypeCodeForUser', () => {
        it('returns null when activeUserId is absent', async () => {
            const ctx = { activeUserId: undefined } as unknown as RequestContext;

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBeNull();
            expect(mockRawQuery).not.toHaveBeenCalled();
        });

        it('returns code from query result', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([{ code: 'WHOLESALE' }]);

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBe('WHOLESALE');
        });

        it('returns null when query returns empty array', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([]);

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBeNull();
        });
    });

    describe('customer price type lookups never resolve a purchase type (#235)', () => {
        it.each(['getPriceTypeCodeForUser', 'getPriceTypeCodeForCustomer', 'getPriceTypeCodeById'])(
            '%s excludes isPurchase in SQL',
            async method => {
                mockRawQuery.mockResolvedValue([]);
                const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
                await (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
                    method
                ](ctx, 'x');

                expect(mockRawQuery.mock.calls[0][0]).toContain('"isPurchase" = false');
            },
        );
    });
});
