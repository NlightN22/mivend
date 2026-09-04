import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceStreamHandler } from '../../handlers/price.handler';

function makeConnection(variantId: string | undefined): {
    rawConnection: { createQueryBuilder: ReturnType<typeof vi.fn> };
} {
    const getRawOne = vi.fn().mockResolvedValue(variantId ? { id: variantId } : undefined);
    const qb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne,
    };
    return { rawConnection: { createQueryBuilder: vi.fn().mockReturnValue(qb) } };
}

const priceType = { id: '1', code: 'WHOLESALE', name: 'Wholesale', isActive: true };

describe('PriceStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when productId/priceTypeId/value is missing', async () => {
        const connection = makeConnection(undefined);
        const customerPricingService = { findPriceTypeByExternalId: vi.fn() };
        const priceEntryService = { upsert: vi.fn() };
        const handler = new PriceStreamHandler(
            connection as never,
            customerPricingService as never,
            priceEntryService as never,
        );

        await handler.apply(ctx, 'price-1', { productId: 'prod-1', priceTypeId: '', value: '10' });

        expect(customerPricingService.findPriceTypeByExternalId).not.toHaveBeenCalled();
        expect(priceEntryService.upsert).not.toHaveBeenCalled();
    });

    it('skips an inactive/deleted price without writing', async () => {
        const connection = makeConnection('variant-1');
        const customerPricingService = { findPriceTypeByExternalId: vi.fn() };
        const priceEntryService = { upsert: vi.fn() };
        const handler = new PriceStreamHandler(
            connection as never,
            customerPricingService as never,
            priceEntryService as never,
        );

        await handler.apply(ctx, 'price-1', {
            productId: 'prod-1',
            priceTypeId: 'guid-1',
            value: '199.90',
            isActive: false,
        });

        expect(customerPricingService.findPriceTypeByExternalId).not.toHaveBeenCalled();
        expect(priceEntryService.upsert).not.toHaveBeenCalled();
    });

    it('skips when no PriceType is found for priceTypeId (out-of-order delivery)', async () => {
        const connection = makeConnection('variant-1');
        const customerPricingService = {
            findPriceTypeByExternalId: vi.fn().mockResolvedValue(null),
        };
        const priceEntryService = { upsert: vi.fn() };
        const handler = new PriceStreamHandler(
            connection as never,
            customerPricingService as never,
            priceEntryService as never,
        );

        await handler.apply(ctx, 'price-1', {
            productId: 'prod-1',
            priceTypeId: 'unknown-guid',
            value: '199.90',
        });

        expect(priceEntryService.upsert).not.toHaveBeenCalled();
    });

    it('skips when no variant matches the productId', async () => {
        const connection = makeConnection(undefined);
        const customerPricingService = {
            findPriceTypeByExternalId: vi.fn().mockResolvedValue(priceType),
        };
        const priceEntryService = { upsert: vi.fn() };
        const handler = new PriceStreamHandler(
            connection as never,
            customerPricingService as never,
            priceEntryService as never,
        );

        await handler.apply(ctx, 'price-1', {
            productId: 'prod-missing',
            priceTypeId: 'guid-1',
            value: '199.90',
        });

        expect(priceEntryService.upsert).not.toHaveBeenCalled();
    });

    it('resolves priceType and variant, then upserts price in cents', async () => {
        const connection = makeConnection('variant-1');
        const customerPricingService = {
            findPriceTypeByExternalId: vi.fn().mockResolvedValue(priceType),
        };
        const priceEntryService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new PriceStreamHandler(
            connection as never,
            customerPricingService as never,
            priceEntryService as never,
        );

        await handler.apply(ctx, 'price-1', {
            productId: 'prod-1',
            priceTypeId: 'guid-1',
            value: '199.90',
            isActive: true,
            isDeleted: false,
        });

        expect(priceEntryService.upsert).toHaveBeenCalledWith(ctx, 'variant-1', 'WHOLESALE', 19990);
    });
});
