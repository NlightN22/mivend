import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PriceStreamHandler } from '../../handlers/price.handler';
import { MissingDependencyError } from '../../types';

const priceType = { id: '1', code: 'WHOLESALE', name: 'Wholesale', isActive: true };

describe('PriceStreamHandler', () => {
    const ctx = {} as RequestContext;
    const live = { productId: 'prod-1', priceTypeId: 'guid-1', value: '199.90', isActive: true };

    const build = (type: unknown = priceType) => {
        const priceEntryService = {
            upsertByProduct: vi.fn().mockResolvedValue(undefined),
            removeByProduct: vi.fn().mockResolvedValue(true),
        };
        const customerPricingService = {
            findPriceTypeByExternalId: vi.fn().mockResolvedValue(type),
        };
        const handler = new PriceStreamHandler(
            customerPricingService as never,
            priceEntryService as never,
        );
        return { handler, priceEntryService, customerPricingService };
    };
    const key = { productId: 'prod-1', priceTypeId: 'guid-1' };

    it('skips when productId/priceTypeId/value is missing', async () => {
        const { handler, priceEntryService, customerPricingService } = build();

        await handler.apply(ctx, 'price-1', { productId: 'prod-1', priceTypeId: '', value: '10' });

        expect(customerPricingService.findPriceTypeByExternalId).not.toHaveBeenCalled();
        expect(priceEntryService.upsertByProduct).not.toHaveBeenCalled();
    });

    // proto3 omits false/zero scalars: a tombstone may carry no value and no isActive at all.
    it.each([
        ['isDeleted', { isActive: true, isDeleted: true, value: '10' }],
        ['isActive false', { isActive: false, value: '10' }],
        ['isActive absent and no value', {}],
    ])('removes the stored price by product ERP id on a tombstone (%s)', async (_n, extra) => {
        const { handler, priceEntryService } = build();
        const outcome = await handler.apply(ctx, 'price-1', { ...key, ...extra });
        expect(priceEntryService.removeByProduct).toHaveBeenCalledWith(ctx, 'prod-1', 'WHOLESALE');
        expect(priceEntryService.upsertByProduct).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ kind: 'applied' });
    });

    it('resolves the product and price type from the entityId when the tombstone body is empty', async () => {
        const { handler, priceEntryService, customerPricingService } = build();
        const outcome = await handler.apply(ctx, 'prod-1:guid-1', { isDeleted: true });
        expect(customerPricingService.findPriceTypeByExternalId).toHaveBeenCalledWith(
            ctx,
            'guid-1',
        );
        expect(priceEntryService.removeByProduct).toHaveBeenCalledWith(ctx, 'prod-1', 'WHOLESALE');
        expect(outcome).toMatchObject({ kind: 'applied' });
    });

    it('is a noop (no retry) for a tombstone of an unknown price type', async () => {
        const { handler, priceEntryService } = build(null);
        await expect(
            handler.apply(ctx, 'price-1', { ...key, isDeleted: true }),
        ).resolves.toMatchObject({ kind: 'noop' });
        expect(priceEntryService.removeByProduct).not.toHaveBeenCalled();
    });

    it('is a noop when the tombstone finds no stored price', async () => {
        const { handler, priceEntryService } = build();
        priceEntryService.removeByProduct.mockResolvedValue(false);
        await expect(
            handler.apply(ctx, 'price-1', { ...key, isDeleted: true }),
        ).resolves.toMatchObject({ kind: 'noop' });
    });

    it('throws MissingDependencyError when no PriceType is found for priceTypeId (issue #96: retry, not silent drop)', async () => {
        const { handler, priceEntryService } = build(null);

        await expect(handler.apply(ctx, 'price-1', live)).rejects.toThrow(MissingDependencyError);
        expect(priceEntryService.upsertByProduct).not.toHaveBeenCalled();
    });

    it('stores the price by product ERP id in cents without looking the product up (#297)', async () => {
        const { handler, priceEntryService } = build();

        const outcome = await handler.apply(ctx, 'price-1', { ...live, isDeleted: false });

        expect(priceEntryService.upsertByProduct).toHaveBeenCalledWith(
            ctx,
            'prod-1',
            'WHOLESALE',
            19990,
        );
        expect(outcome).toMatchObject({ kind: 'applied' });
    });
});
