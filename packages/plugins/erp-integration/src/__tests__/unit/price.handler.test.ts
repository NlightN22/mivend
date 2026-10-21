import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceStreamHandler } from '../../handlers/price.handler';
import { MissingDependencyError } from '../../types';

function makeConnection(variantId: string | undefined): {
    getRepository: ReturnType<typeof vi.fn>;
} {
    const query = vi.fn().mockResolvedValue(variantId ? [{ id: variantId }] : []);
    return { getRepository: vi.fn().mockReturnValue({ query }) };
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

    const build = (variantId: string | undefined, type: unknown = priceType) => {
        const priceEntryService = { upsert: vi.fn(), remove: vi.fn().mockResolvedValue(true) };
        const handler = new PriceStreamHandler(
            makeConnection(variantId) as never,
            { findPriceTypeByExternalId: vi.fn().mockResolvedValue(type) } as never,
            priceEntryService as never,
        );
        return { handler, priceEntryService };
    };
    const key = { productId: 'prod-1', priceTypeId: 'guid-1' };

    // proto3 omits false/zero scalars: a tombstone may carry no value and no isActive at all.
    it.each([
        ['isDeleted', { isActive: true, isDeleted: true, value: '10' }],
        ['isActive false', { isActive: false, value: '10' }],
        ['isActive absent and no value', {}],
    ])('removes the stored price on a tombstone (%s)', async (_n, extra) => {
        const { handler, priceEntryService } = build('variant-1');
        const outcome = await handler.apply(ctx, 'price-1', { ...key, ...extra });
        expect(priceEntryService.remove).toHaveBeenCalledWith(ctx, 'variant-1', 'WHOLESALE');
        expect(priceEntryService.upsert).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ kind: 'applied' });
    });

    it('resolves the product and price type from the entityId when the tombstone body is empty', async () => {
        const { handler, priceEntryService } = build('variant-1');
        const outcome = await handler.apply(ctx, 'prod-1:guid-1', { isDeleted: true });
        expect(priceEntryService.remove).toHaveBeenCalledWith(ctx, 'variant-1', 'WHOLESALE');
        expect(outcome).toMatchObject({ kind: 'applied' });
    });

    it('is a noop (no retry) for a tombstone of an unknown price type or product', async () => {
        const unknownType = build('variant-1', null);
        await expect(
            unknownType.handler.apply(ctx, 'price-1', { ...key, isDeleted: true }),
        ).resolves.toMatchObject({ kind: 'noop' });
        const unknownProduct = build(undefined);
        await expect(
            unknownProduct.handler.apply(ctx, 'price-1', { ...key, isDeleted: true }),
        ).resolves.toMatchObject({ kind: 'noop' });
        expect(unknownType.priceEntryService.remove).not.toHaveBeenCalled();
        expect(unknownProduct.priceEntryService.remove).not.toHaveBeenCalled();
    });

    it('is a noop when the tombstone finds no stored price', async () => {
        const { handler, priceEntryService } = build('variant-1');
        priceEntryService.remove.mockResolvedValue(false);
        await expect(
            handler.apply(ctx, 'price-1', { ...key, isDeleted: true }),
        ).resolves.toMatchObject({ kind: 'noop' });
    });

    it('throws MissingDependencyError when no PriceType is found for priceTypeId (issue #96: retry, not silent drop)', async () => {
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

        await expect(
            handler.apply(ctx, 'price-1', {
                productId: 'prod-1',
                priceTypeId: 'unknown-guid',
                value: '199.90',
                isActive: true,
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(priceEntryService.upsert).not.toHaveBeenCalled();
    });

    it('throws MissingDependencyError when no variant matches the productId', async () => {
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

        await expect(
            handler.apply(ctx, 'price-1', {
                productId: 'prod-missing',
                priceTypeId: 'guid-1',
                value: '199.90',
                isActive: true,
            }),
        ).rejects.toThrow(MissingDependencyError);
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
