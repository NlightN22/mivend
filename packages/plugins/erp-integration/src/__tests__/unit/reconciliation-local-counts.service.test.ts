import { describe, expect, it } from 'vitest';

import { ReconciliationLocalCountsService } from '../../reconciliation-local-counts.service';

describe('ReconciliationLocalCountsService', () => {
    function makeService(overrides: {
        collectionTotalItems?: number;
        productTotalItems?: number;
        organizations?: Array<{ isActive: boolean }>;
        warehouses?: Array<{ isActive: boolean }>;
        priceTypes?: Array<{ isActive: boolean }>;
    }) {
        const collectionService = {
            findAll: async () => ({ items: [], totalItems: overrides.collectionTotalItems ?? 0 }),
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
        return new ReconciliationLocalCountsService(
            collectionService as never,
            productService as never,
            customerPricingService as never,
            warehouseService as never,
            documentsService as never,
        );
    }

    it('subtracts the root Collection from the category count', async () => {
        const service = makeService({ collectionTotalItems: 6 });
        expect(await service.getLocalActiveCount({} as never, 'category')).toBe(5);
    });

    it('never returns a negative category count if the root is somehow absent', async () => {
        const service = makeService({ collectionTotalItems: 0 });
        expect(await service.getLocalActiveCount({} as never, 'category')).toBe(0);
    });

    it('counts only active organizations', async () => {
        const service = makeService({
            organizations: [{ isActive: true }, { isActive: false }, { isActive: true }],
        });
        expect(await service.getLocalActiveCount({} as never, 'organization')).toBe(2);
    });

    it('counts only active warehouses', async () => {
        const service = makeService({
            warehouses: [{ isActive: true }, { isActive: true }, { isActive: false }],
        });
        expect(await service.getLocalActiveCount({} as never, 'warehouse')).toBe(2);
    });

    it('counts only active price types', async () => {
        const service = makeService({
            priceTypes: [{ isActive: false }, { isActive: true }],
        });
        expect(await service.getLocalActiveCount({} as never, 'priceType')).toBe(1);
    });

    it('uses the enabled-product totalItems directly (already filtered server-side)', async () => {
        const service = makeService({ productTotalItems: 123 });
        expect(await service.getLocalActiveCount({} as never, 'product')).toBe(123);
    });
});
