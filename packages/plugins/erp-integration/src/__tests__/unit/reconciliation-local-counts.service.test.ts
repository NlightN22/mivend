import { describe, expect, it, vi } from 'vitest';

import { ReconciliationLocalCountsService } from '../../reconciliation-local-counts.service';

describe('ReconciliationLocalCountsService', () => {
    function makeService(overrides: {
        collectionTotalItems?: number;
        productTotalItems?: number;
        organizations?: Array<{ isActive: boolean }>;
        warehouses?: Array<{ isActive: boolean }>;
        priceTypes?: Array<{ isActive: boolean }>;
        priceEntryCount?: number;
        stockLevelCount?: number;
    }) {
        const collectionService = {
            findAll: vi
                .fn()
                .mockResolvedValue({ items: [], totalItems: overrides.collectionTotalItems ?? 0 }),
        };
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
        const connection = {
            getRepository: (_ctx: unknown, _entity: { name: string }) => ({
                count: async () => overrides.priceEntryCount ?? 0,
                createQueryBuilder: () => stockQueryBuilder,
            }),
        };
        const service = new ReconciliationLocalCountsService(
            collectionService as never,
            productService as never,
            customerPricingService as never,
            warehouseService as never,
            documentsService as never,
            connection as never,
        );
        return { service, collectionService, stockQueryBuilder };
    }

    it('subtracts the root Collection from the category count', async () => {
        const { service } = makeService({ collectionTotalItems: 6 });
        expect(await service.getLocalActiveCount({} as never, 'category')).toBe(5);
    });

    // mivend.audit.85 HIGH finding: issue #90 hides a deactivated category's Collection via
    // isPrivate:true, but this count must exclude those hidden rows too, or a deactivated
    // category still counts as present and the reconciliation gap never actually closes.
    it('only counts public (non-hidden) categories', async () => {
        const { service, collectionService } = makeService({ collectionTotalItems: 6 });
        await service.getLocalActiveCount({} as never, 'category');
        expect(collectionService.findAll).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ filter: { isPrivate: { eq: false } } }),
        );
    });

    it('never returns a negative category count if the root is somehow absent', async () => {
        const { service } = makeService({ collectionTotalItems: 0 });
        expect(await service.getLocalActiveCount({} as never, 'category')).toBe(0);
    });

    it('counts only active organizations', async () => {
        const { service } = makeService({
            organizations: [{ isActive: true }, { isActive: false }, { isActive: true }],
        });
        expect(await service.getLocalActiveCount({} as never, 'organization')).toBe(2);
    });

    it('counts only active warehouses', async () => {
        const { service } = makeService({
            warehouses: [{ isActive: true }, { isActive: true }, { isActive: false }],
        });
        expect(await service.getLocalActiveCount({} as never, 'warehouse')).toBe(2);
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

    it('counts price rows as a plain row count (simplified, not per-fact matched)', async () => {
        const { service } = makeService({ priceEntryCount: 456 });
        expect(await service.getLocalActiveCount({} as never, 'price')).toBe(456);
    });

    // A plain StockLevel row count is structurally wrong (Vendure auto-creates a zero-quantity
    // row per variant regardless of whether any real stock event was ever received) — must be
    // filtered to rows StockStreamHandler actually wrote real data into.
    it('counts only StockLevel rows with a real received erpAvailableQuantity, not every row', async () => {
        const { service, stockQueryBuilder } = makeService({ stockLevelCount: 789 });
        expect(await service.getLocalActiveCount({} as never, 'stock')).toBe(789);
        expect(stockQueryBuilder.where).toHaveBeenCalledWith(
            '"stockLevel"."customFieldsErpavailablequantity" IS NOT NULL',
        );
    });
});
