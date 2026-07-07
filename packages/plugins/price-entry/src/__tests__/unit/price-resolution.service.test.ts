import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { PriceResolutionService } from '../../price-resolution.service';
import type { PriceEntryService } from '../../price-entry.service';
import type { DiscountRuleService } from '../../discount-rule.service';

interface FakeFacetValue {
    code: string;
    name: string;
    facet: { code: string };
    translations: { languageCode: string; name: string }[];
}

interface FakeVariant {
    id: string;
    facetValues: FakeFacetValue[];
    product?: { facetValues: FakeFacetValue[] };
    customFields: { weight: number | null };
}

const variantsById: Record<string, FakeVariant> = {};
const pricesByVariantId: Record<string, number> = {};

const mockVariantRepo = {
    findOne: vi.fn(
        async ({ where: { id } }: { where: { id: string } }) => variantsById[id] ?? null,
    ),
};

const mockConnection = {
    getRepository: vi.fn(() => mockVariantRepo),
} as unknown as TransactionalConnection;

const mockCtx = { languageCode: 'en' } as unknown as RequestContext;

function brandVariant(
    id: string,
    brandCode: string,
    weight: number | null,
    price = 1000,
    brandName = brandCode,
): FakeVariant {
    pricesByVariantId[id] = price;
    return {
        id,
        facetValues: [],
        product: {
            facetValues: [
                {
                    code: brandCode,
                    name: brandName,
                    facet: { code: 'brand' },
                    translations: [{ languageCode: 'en', name: brandName }],
                },
            ],
        },
        customFields: { weight },
    };
}

describe('PriceResolutionService', () => {
    let priceEntryService: {
        getPriceTypeCodeForUser: ReturnType<typeof vi.fn>;
        getForVariant: ReturnType<typeof vi.fn>;
    };
    let discountRuleService: {
        getBestPercent: ReturnType<typeof vi.fn>;
        getTiers: ReturnType<typeof vi.fn>;
    };
    let service: PriceResolutionService;

    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(variantsById)) delete variantsById[key];
        for (const key of Object.keys(pricesByVariantId)) delete pricesByVariantId[key];

        priceEntryService = {
            getPriceTypeCodeForUser: vi.fn(async () => 'WHOLESALE'),
            getForVariant: vi.fn(
                async (_ctx, variantId: string) => pricesByVariantId[variantId] ?? 1000,
            ),
        };
        discountRuleService = {
            getBestPercent: vi.fn(async () => null),
            getTiers: vi.fn(async () => []),
        };
        service = new PriceResolutionService(
            priceEntryService as unknown as PriceEntryService,
            discountRuleService as unknown as DiscountRuleService,
            mockConnection,
        );
    });

    it('passes empty weight/amount Maps when no orderContext is given (catalog display)', async () => {
        variantsById.v1 = brandVariant('v1', 'lukoil', 100);

        await service.resolve(mockCtx, 'v1');

        expect(discountRuleService.getBestPercent).toHaveBeenCalledWith(
            mockCtx,
            'WHOLESALE',
            [{ facetCode: 'brand', valueCode: 'lukoil', name: 'lukoil' }],
            expect.any(Date),
            new Map(),
            new Map(),
        );
    });

    it('sums weight across this variant and other order lines sharing the facet', async () => {
        variantsById.v1 = brandVariant('v1', 'lukoil', 100);
        variantsById.v2 = brandVariant('v2', 'lukoil', 50);

        const order = {
            lines: [{ productVariantId: 'v2', quantity: 4 }],
        } as unknown as Order;

        await service.resolve(mockCtx, 'v1', { order, quantity: 3 });

        const weightByFacet = discountRuleService.getBestPercent.mock.calls[0][4] as Map<
            string,
            number
        >;
        // v1: 100kg * 3 + v2: 50kg * 4 = 500
        expect(weightByFacet.get('brand:lukoil')).toBe(500);
    });

    it('sums spend (basePrice * quantity) across this variant and other order lines sharing the facet', async () => {
        variantsById.v1 = brandVariant('v1', 'lukoil', 100, 2000);
        variantsById.v2 = brandVariant('v2', 'lukoil', 50, 3000);

        const order = {
            lines: [{ productVariantId: 'v2', quantity: 4 }],
        } as unknown as Order;

        await service.resolve(mockCtx, 'v1', { order, quantity: 3 });

        const amountByFacet = discountRuleService.getBestPercent.mock.calls[0][5] as Map<
            string,
            number
        >;
        // v1: 2000 * 3 + v2: 3000 * 4 = 18000
        expect(amountByFacet.get('brand:lukoil')).toBe(18000);
    });

    it('does not double-count this variant if it already has a line in the order (adjustOrderLine)', async () => {
        variantsById.v1 = brandVariant('v1', 'lukoil', 100);

        const order = {
            lines: [{ productVariantId: 'v1', quantity: 2 }],
        } as unknown as Order;

        await service.resolve(mockCtx, 'v1', { order, quantity: 5 });

        const weightByFacet = discountRuleService.getBestPercent.mock.calls[0][4] as Map<
            string,
            number
        >;
        expect(weightByFacet.get('brand:lukoil')).toBe(500);
    });

    it('returns null prices when the customer has no price type', async () => {
        priceEntryService.getPriceTypeCodeForUser.mockResolvedValue(null);

        const result = await service.resolve(mockCtx, 'v1');

        expect(result).toEqual({ customerPrice: null, compareAtPrice: null });
        expect(discountRuleService.getBestPercent).not.toHaveBeenCalled();
    });

    describe('resolveTiers', () => {
        it('returns an empty array when the customer has no price type', async () => {
            priceEntryService.getPriceTypeCodeForUser.mockResolvedValue(null);

            const result = await service.resolveTiers(mockCtx, 'v1');

            expect(result).toEqual([]);
            expect(discountRuleService.getTiers).not.toHaveBeenCalled();
        });

        it('delegates to DiscountRuleService.getTiers with the variant facets', async () => {
            variantsById.v1 = brandVariant('v1', 'lukoil', 100);
            const tiers = [
                {
                    percent: 15,
                    minWeightKg: 500,
                    minAmount: null,
                    facetCode: 'brand',
                    facetValueCode: 'lukoil',
                },
            ];
            discountRuleService.getTiers.mockResolvedValue(tiers);

            const result = await service.resolveTiers(mockCtx, 'v1');

            expect(discountRuleService.getTiers).toHaveBeenCalledWith(
                mockCtx,
                'WHOLESALE',
                [{ facetCode: 'brand', valueCode: 'lukoil', name: 'lukoil' }],
                expect.any(Date),
            );
            expect(result).toBe(tiers);
        });

        it('returns an empty array when the variant has no PriceEntry for the price type', async () => {
            variantsById.v1 = brandVariant('v1', 'lukoil', 100);
            priceEntryService.getForVariant.mockResolvedValue(null);

            const result = await service.resolveTiers(mockCtx, 'v1');

            expect(result).toEqual([]);
            expect(discountRuleService.getTiers).not.toHaveBeenCalled();
        });
    });

    describe('resolveTierProgress', () => {
        it('returns null when there are no ladder tiers for the variant facets', async () => {
            variantsById.v1 = brandVariant('v1', 'lukoil', 100);
            discountRuleService.getTiers.mockResolvedValue([]);

            const order = { lines: [] } as unknown as Order;
            const result = await service.resolveTierProgress(mockCtx, 'v1', { order, quantity: 1 });

            expect(result).toBeNull();
        });

        it('returns progress toward the next unreached weight tier', async () => {
            variantsById.v1 = brandVariant('v1', 'lukoil', 100, 1000, 'Lukoil');
            discountRuleService.getTiers.mockResolvedValue([
                {
                    percent: 15,
                    minWeightKg: 500,
                    minAmount: null,
                    facetCode: 'brand',
                    facetValueCode: 'lukoil',
                },
                {
                    percent: 20,
                    minWeightKg: 1000,
                    minAmount: null,
                    facetCode: 'brand',
                    facetValueCode: 'lukoil',
                },
            ]);

            const order = { lines: [] } as unknown as Order;
            // 6 * 100kg = 600kg — past the 500kg rung, short of the 1000kg rung
            const result = await service.resolveTierProgress(mockCtx, 'v1', { order, quantity: 6 });

            expect(result).toEqual({
                facetName: 'Lukoil',
                metric: 'WEIGHT',
                current: 600,
                currentPercent: 15,
                nextThreshold: 1000,
                nextPercent: 20,
            });
        });

        it('reports no next tier once the top rung is reached', async () => {
            variantsById.v1 = brandVariant('v1', 'lukoil', 100, 1000, 'Lukoil');
            discountRuleService.getTiers.mockResolvedValue([
                {
                    percent: 15,
                    minWeightKg: 500,
                    minAmount: null,
                    facetCode: 'brand',
                    facetValueCode: 'lukoil',
                },
                {
                    percent: 20,
                    minWeightKg: 1000,
                    minAmount: null,
                    facetCode: 'brand',
                    facetValueCode: 'lukoil',
                },
            ]);

            const order = { lines: [] } as unknown as Order;
            const result = await service.resolveTierProgress(mockCtx, 'v1', {
                order,
                quantity: 12,
            });

            expect(result).toEqual({
                facetName: 'Lukoil',
                metric: 'WEIGHT',
                current: 1200,
                currentPercent: 20,
                nextThreshold: null,
                nextPercent: null,
            });
        });

        it('returns null when the customer has no price type', async () => {
            priceEntryService.getPriceTypeCodeForUser.mockResolvedValue(null);

            const order = { lines: [] } as unknown as Order;
            const result = await service.resolveTierProgress(mockCtx, 'v1', { order, quantity: 1 });

            expect(result).toBeNull();
        });
    });
});
