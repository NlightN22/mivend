import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { PriceResolutionService } from '../../price-resolution.service';
import type { PriceEntryService } from '../../price-entry.service';
import type { DiscountRuleService } from '../../discount-rule.service';

interface FakeVariant {
    id: string;
    facetValues: { code: string; facet: { code: string } }[];
    product?: { facetValues: { code: string; facet: { code: string } }[] };
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

const mockCtx = {} as unknown as RequestContext;

function brandVariant(
    id: string,
    brandCode: string,
    weight: number | null,
    price = 1000,
): FakeVariant {
    pricesByVariantId[id] = price;
    return {
        id,
        facetValues: [],
        product: { facetValues: [{ code: brandCode, facet: { code: 'brand' } }] },
        customFields: { weight },
    };
}

describe('PriceResolutionService', () => {
    let priceEntryService: {
        getPriceTypeCodeForUser: ReturnType<typeof vi.fn>;
        getForVariant: ReturnType<typeof vi.fn>;
    };
    let discountRuleService: { getBestPercent: ReturnType<typeof vi.fn> };
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
            [{ facetCode: 'brand', valueCode: 'lukoil' }],
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
});
