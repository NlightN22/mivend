import { describe, expect, it, vi } from 'vitest';

import { ReconciliationLocalCountsService } from '../../reconciliation-local-counts.service';

describe('ReconciliationLocalCountsService', () => {
    function makeService(overrides: {
        productTotalItems?: number;
        organizations?: Array<{ isActive: boolean }>;
        warehouses?: Array<{ isActive: boolean }>;
        priceTypes?: Array<{ isActive: boolean }>;
        sqlCount?: number;
        stockLevelCount?: number;
    }) {
        const productService = {
            findAll: async () => ({ items: [], totalItems: overrides.productTotalItems ?? 0 }),
        };
        const customerPricingService = {
            findAllPriceTypes: async () => overrides.priceTypes ?? [],
        };
        const warehouseService = {
            findAll: async () => overrides.warehouses ?? [],
        };
        const documentsService = {
            findAllRequisites: async () => overrides.organizations ?? [],
        };
        const stockQueryBuilder = {
            where: vi.fn().mockReturnThis(),
            getCount: vi.fn().mockResolvedValue(overrides.stockLevelCount ?? 0),
        };
        const querySpy = vi.fn().mockResolvedValue([{ n: overrides.sqlCount ?? 0 }]);
        const connection = {
            getRepository: (_ctx: unknown, _entity: { name: string }) => ({
                query: querySpy,
                createQueryBuilder: () => stockQueryBuilder,
            }),
        };
        const service = new ReconciliationLocalCountsService(
            productService as never,
            customerPricingService as never,
            warehouseService as never,
            documentsService as never,
            connection as never,
        );
        return { service, querySpy, stockQueryBuilder };
    }

    it('reads the category count from SQL excluding root and feed-hidden', async () => {
        const { service, querySpy } = makeService({ sqlCount: 6 });
        expect(await service.getLocalActiveCount({} as never, 'category')).toBe(6);
        expect(querySpy.mock.calls[0][0]).toContain('"customFieldsFeedhidden" = false');
    });

    it('counts only active organizations', async () => {
        const { service } = makeService({
            organizations: [{ isActive: true }, { isActive: false }, { isActive: true }],
        });
        expect(await service.getLocalActiveCount({} as never, 'organization')).toBe(2);
    });

    it('adds skipped active folder warehouses to the active warehouses', async () => {
        const { service } = makeService({
            warehouses: [{ isActive: true }, { isActive: true }, { isActive: false }],
            sqlCount: 3,
        });
        expect(await service.getLocalActiveCount({} as never, 'warehouse')).toBe(5);
    });

    it('counts only active price types', async () => {
        const { service } = makeService({
            priceTypes: [{ isActive: false }, { isActive: true }],
        });
        expect(await service.getLocalActiveCount({} as never, 'priceType')).toBe(1);
    });

    it('uses the enabled-product totalItems directly (already filtered server-side)', async () => {
        const { service } = makeService({ productTotalItems: 123 });
        expect(await service.getLocalActiveCount({} as never, 'product')).toBe(123);
    });

    it('reads the price count from SQL restricted to existing products', async () => {
        const { service, querySpy } = makeService({ sqlCount: 456 });
        expect(await service.getLocalActiveCount({} as never, 'price')).toBe(456);
        expect(querySpy.mock.calls[0][0]).toContain('EXISTS (SELECT 1 FROM product p');
    });

    // Vendure auto-creates a zero-quantity StockLevel row per variant, so a plain row count is wrong.
    // Filter to rows StockStreamHandler actually wrote to.
    it('counts only StockLevel rows with a real received erpAvailableQuantity, not every row', async () => {
        const { service, stockQueryBuilder } = makeService({ stockLevelCount: 789 });
        expect(await service.getLocalActiveCount({} as never, 'stock')).toBe(789);
        expect(stockQueryBuilder.where).toHaveBeenCalledWith(
            '"stockLevel"."customFieldsErpavailablequantity" IS NOT NULL',
        );
    });
});
