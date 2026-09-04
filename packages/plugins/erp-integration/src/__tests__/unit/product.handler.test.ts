import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ProductStreamHandler } from '../../handlers/product.handler';

function makeConnection(existingId: string | undefined): {
    rawConnection: { createQueryBuilder: ReturnType<typeof vi.fn> };
} {
    const getRawOne = vi.fn().mockResolvedValue(existingId ? { id: existingId } : undefined);
    const qb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne,
    };
    return {
        rawConnection: {
            createQueryBuilder: vi.fn().mockReturnValue(qb),
        },
    };
}

describe('ProductStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when sku or name is missing', async () => {
        const connection = makeConnection(undefined);
        const productService = { create: vi.fn(), update: vi.fn() };
        const productVariantService = {
            getVariantsByProductId: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        };
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: '', name: 'Widget' });

        expect(productService.create).not.toHaveBeenCalled();
        expect(productService.update).not.toHaveBeenCalled();
    });

    it('creates a new product and a default variant, reading isActive (not enabled)', async () => {
        const connection = makeConnection(undefined);
        const productService = {
            create: vi.fn().mockResolvedValue({ id: '10' }),
            update: vi.fn(),
        };
        const productVariantService = {
            getVariantsByProductId: vi.fn(),
            create: vi.fn().mockResolvedValue([{ id: '20' }]),
            update: vi.fn(),
        };
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', isActive: false });

        expect(productService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ enabled: false, customFields: { externalId: 'p-1' } }),
        );
        expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
            expect.objectContaining({ productId: '10', sku: 'SKU-1' }),
        ]);
    });

    it('on update, toggles the existing variant using isActive and does not read organizationId', async () => {
        const connection = makeConnection('existing-product-id');
        const productService = { create: vi.fn(), update: vi.fn().mockResolvedValue({}) };
        const productVariantService = {
            getVariantsByProductId: vi.fn().mockResolvedValue({ items: [{ id: 'variant-1' }] }),
            create: vi.fn(),
            update: vi.fn().mockResolvedValue([{}]),
        };
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', isActive: true });

        expect(productService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'existing-product-id', enabled: true }),
        );
        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            { id: 'variant-1', enabled: true },
        ]);
        const updateCallArg = productVariantService.update.mock.calls[0][1][0];
        expect(updateCallArg).not.toHaveProperty('customFields');
    });
});
