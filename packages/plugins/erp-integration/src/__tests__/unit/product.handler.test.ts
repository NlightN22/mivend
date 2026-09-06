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

function makeTaxCategoryService(
    items: Array<{ id: string; isDefault: boolean; customFields: { erpVatCode?: string | null } }>,
): { findAll: ReturnType<typeof vi.fn> } {
    return { findAll: vi.fn().mockResolvedValue({ items, totalItems: items.length }) };
}

function makeProductTaxCodeFlagService(): { report: ReturnType<typeof vi.fn> } {
    return { report: vi.fn().mockResolvedValue(undefined) };
}

const DEFAULT_TAX_CATEGORY = { id: 'tax-default', isDefault: true, customFields: {} };

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
        const taxCategoryService = makeTaxCategoryService([DEFAULT_TAX_CATEGORY]);
        const productTaxCodeFlagService = makeProductTaxCodeFlagService();
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
            taxCategoryService as never,
            productTaxCodeFlagService as never,
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
        const taxCategoryService = makeTaxCategoryService([DEFAULT_TAX_CATEGORY]);
        const productTaxCodeFlagService = makeProductTaxCodeFlagService();
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
            taxCategoryService as never,
            productTaxCodeFlagService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', isActive: false });

        expect(productService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ enabled: false, customFields: { externalId: 'p-1' } }),
        );
        expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
            expect.objectContaining({
                productId: '10',
                sku: 'SKU-1',
                taxCategoryId: 'tax-default',
            }),
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
        const taxCategoryService = makeTaxCategoryService([DEFAULT_TAX_CATEGORY]);
        const productTaxCodeFlagService = makeProductTaxCodeFlagService();
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
            taxCategoryService as never,
            productTaxCodeFlagService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', isActive: true });

        expect(productService.update).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'existing-product-id', enabled: true }),
        );
        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            { id: 'variant-1', enabled: true, taxCategoryId: 'tax-default' },
        ]);
    });

    it('resolves a recognized VAT code to its matching TaxCategory, without a flag', async () => {
        const connection = makeConnection(undefined);
        const productService = { create: vi.fn().mockResolvedValue({ id: '10' }), update: vi.fn() };
        const productVariantService = {
            getVariantsByProductId: vi.fn(),
            create: vi.fn().mockResolvedValue([{ id: '20' }]),
            update: vi.fn(),
        };
        const taxCategoryService = makeTaxCategoryService([
            DEFAULT_TAX_CATEGORY,
            { id: 'tax-nds10', isDefault: false, customFields: { erpVatCode: 'NDS10' } },
        ]);
        const productTaxCodeFlagService = makeProductTaxCodeFlagService();
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
            taxCategoryService as never,
            productTaxCodeFlagService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', vatCode: 'НДС10' });

        expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
            expect.objectContaining({ taxCategoryId: 'tax-nds10' }),
        ]);
        expect(productTaxCodeFlagService.report).not.toHaveBeenCalled();
    });

    it('falls back to the default TaxCategory and reports a flag for an unrecognized VAT code', async () => {
        const connection = makeConnection(undefined);
        const productService = { create: vi.fn().mockResolvedValue({ id: '10' }), update: vi.fn() };
        const productVariantService = {
            getVariantsByProductId: vi.fn(),
            create: vi.fn().mockResolvedValue([{ id: '20' }]),
            update: vi.fn(),
        };
        const taxCategoryService = makeTaxCategoryService([DEFAULT_TAX_CATEGORY]);
        const productTaxCodeFlagService = makeProductTaxCodeFlagService();
        const handler = new ProductStreamHandler(
            connection as never,
            productService as never,
            productVariantService as never,
            taxCategoryService as never,
            productTaxCodeFlagService as never,
        );

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', vatCode: 'НДС999' });

        expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
            expect.objectContaining({ taxCategoryId: 'tax-default' }),
        ]);
        expect(productTaxCodeFlagService.report).toHaveBeenCalledWith(
            ctx,
            'p-1',
            'НДС999',
            expect.objectContaining({ reason: 'unrecognized' }),
        );
    });
});
