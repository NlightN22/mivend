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

function makeProductCategoryFlagService(): { report: ReturnType<typeof vi.fn> } {
    return { report: vi.fn().mockResolvedValue(undefined) };
}

// Mirrors CategoryStreamHandler's own facet-value shape (code = the category's own entityId).
function makeFacetServices(categoryFacetValues: Array<{ id: string; code: string }> | undefined): {
    facetService: { findByCode: ReturnType<typeof vi.fn> };
    facetValueService: { findByFacetId: ReturnType<typeof vi.fn> };
} {
    const facetService = {
        findByCode: vi
            .fn()
            .mockResolvedValue(
                categoryFacetValues === undefined ? undefined : { id: 'facet-category' },
            ),
    };
    const facetValueService = {
        findByFacetId: vi
            .fn()
            .mockResolvedValue(
                (categoryFacetValues ?? []).map(v => ({ ...v, facetId: 'facet-category' })),
            ),
    };
    return { facetService, facetValueService };
}

const DEFAULT_TAX_CATEGORY = { id: 'tax-default', isDefault: true, customFields: {} };

function makeHandler(overrides?: {
    connection?: ReturnType<typeof makeConnection>;
    productService?: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    productVariantService?: {
        getVariantsByProductId: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        findOne: ReturnType<typeof vi.fn>;
    };
    taxCategoryService?: { findAll: ReturnType<typeof vi.fn> };
    productTaxCodeFlagService?: { report: ReturnType<typeof vi.fn> };
    facetService?: { findByCode: ReturnType<typeof vi.fn> };
    facetValueService?: { findByFacetId: ReturnType<typeof vi.fn> };
    productCategoryFlagService?: { report: ReturnType<typeof vi.fn> };
}): {
    handler: ProductStreamHandler;
    productService: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    productVariantService: {
        getVariantsByProductId: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        findOne: ReturnType<typeof vi.fn>;
    };
    productTaxCodeFlagService: { report: ReturnType<typeof vi.fn> };
    productCategoryFlagService: { report: ReturnType<typeof vi.fn> };
} {
    const connection = overrides?.connection ?? makeConnection(undefined);
    const productService = overrides?.productService ?? {
        create: vi.fn().mockResolvedValue({ id: '10' }),
        update: vi.fn(),
    };
    const productVariantService = overrides?.productVariantService ?? {
        getVariantsByProductId: vi.fn(),
        create: vi.fn().mockResolvedValue([{ id: '20' }]),
        update: vi.fn(),
        findOne: vi.fn().mockResolvedValue(undefined),
    };
    const taxCategoryService =
        overrides?.taxCategoryService ?? makeTaxCategoryService([DEFAULT_TAX_CATEGORY]);
    const productTaxCodeFlagService =
        overrides?.productTaxCodeFlagService ?? makeProductTaxCodeFlagService();
    const { facetService, facetValueService } = overrides?.facetService
        ? { facetService: overrides.facetService, facetValueService: overrides.facetValueService! }
        : makeFacetServices(undefined);
    const productCategoryFlagService =
        overrides?.productCategoryFlagService ?? makeProductCategoryFlagService();

    const handler = new ProductStreamHandler(
        connection as never,
        productService as never,
        productVariantService as never,
        taxCategoryService as never,
        productTaxCodeFlagService as never,
        facetService as never,
        facetValueService as never,
        productCategoryFlagService as never,
    );
    return {
        handler,
        productService,
        productVariantService,
        productTaxCodeFlagService,
        productCategoryFlagService,
    };
}

describe('ProductStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when sku or name is missing', async () => {
        const { handler, productService } = makeHandler();

        await handler.apply(ctx, 'p-1', { sku: '', name: 'Widget' });

        expect(productService.create).not.toHaveBeenCalled();
        expect(productService.update).not.toHaveBeenCalled();
    });

    it('creates a new product and a default variant, reading isActive (not enabled)', async () => {
        const { handler, productService, productVariantService } = makeHandler();

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

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — proto3 JSON
    // encoding omits a scalar field equal to its zero-value, so `isActive:false` is NEVER sent
    // explicitly, only as an absent key (confirmed live with Search Platform, mivend#89's
    // follow-up — a real production/staging incident, not a hypothetical). Absent must read as
    // false (disabled), not true.
    it('treats isActive absent from the payload as disabled (proto3 omits the false zero-value)', async () => {
        const { handler, productService } = makeHandler();

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget' });

        expect(productService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ enabled: false, customFields: { externalId: 'p-1' } }),
        );
    });

    it('on update, toggles the existing variant using isActive and does not read organizationId', async () => {
        const connection = makeConnection('existing-product-id');
        const productVariantService = {
            getVariantsByProductId: vi.fn().mockResolvedValue({ items: [{ id: 'variant-1' }] }),
            create: vi.fn(),
            update: vi.fn().mockResolvedValue([{}]),
            findOne: vi.fn().mockResolvedValue({ id: 'variant-1', facetValues: [] }),
        };
        const productService = { create: vi.fn(), update: vi.fn().mockResolvedValue({}) };
        const { handler } = makeHandler({ connection, productService, productVariantService });

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
        const taxCategoryService = makeTaxCategoryService([
            DEFAULT_TAX_CATEGORY,
            { id: 'tax-nds10', isDefault: false, customFields: { erpVatCode: 'NDS10' } },
        ]);
        const { handler, productVariantService, productTaxCodeFlagService } = makeHandler({
            taxCategoryService,
        });

        await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', vatCode: 'НДС10' });

        expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
            expect.objectContaining({ taxCategoryId: 'tax-nds10' }),
        ]);
        expect(productTaxCodeFlagService.report).not.toHaveBeenCalled();
    });

    it('falls back to the default TaxCategory and reports a flag for an unrecognized VAT code', async () => {
        const { handler, productVariantService, productTaxCodeFlagService } = makeHandler();

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

    // issue #116 — category_id resolution (Tier 1)
    describe('category resolution', () => {
        it('assigns the resolved category facet value to the new default VARIANT (not the product)', async () => {
            const { facetService, facetValueService } = makeFacetServices([
                { id: 'fv-cat-1', code: 'cat-1' },
            ]);
            const { handler, productService, productVariantService, productCategoryFlagService } =
                makeHandler({ facetService, facetValueService });

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', categoryId: 'cat-1' });

            expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
                expect.objectContaining({ facetValueIds: ['fv-cat-1'] }),
            ]);
            // Vendure's facet-value-filter Collection matches on the VARIANT's facet values, not
            // the parent Product's (issue #60's documented footgun) — the product create call
            // must never carry facetValueIds itself.
            expect(productService.create).toHaveBeenCalledWith(
                ctx,
                expect.not.objectContaining({ facetValueIds: expect.anything() }),
            );
            expect(productCategoryFlagService.report).not.toHaveBeenCalled();
        });

        it('creates the product without a category facet value and reports a flag when category_id is absent', async () => {
            const { handler, productVariantService, productCategoryFlagService } = makeHandler();

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget' });

            expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
                expect.not.objectContaining({ facetValueIds: expect.anything() }),
            ]);
            expect(productCategoryFlagService.report).toHaveBeenCalledWith(
                ctx,
                'p-1',
                null,
                expect.objectContaining({ reason: 'absent' }),
            );
        });

        it('creates the product without a category facet value and reports a flag when the category has not synced yet', async () => {
            const { facetService, facetValueService } = makeFacetServices([]);
            const { handler, productVariantService, productCategoryFlagService } = makeHandler({
                facetService,
                facetValueService,
            });

            await handler.apply(ctx, 'p-1', {
                sku: 'SKU-1',
                name: 'Widget',
                categoryId: 'cat-unknown',
            });

            expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
                expect.not.objectContaining({ facetValueIds: expect.anything() }),
            ]);
            expect(productCategoryFlagService.report).toHaveBeenCalledWith(
                ctx,
                'p-1',
                'cat-unknown',
                expect.objectContaining({ reason: 'not-found' }),
            );
        });

        it('does not blow up when the category facet itself has never been created yet', async () => {
            const { facetService, facetValueService } = makeFacetServices(undefined);
            const { handler, productVariantService } = makeHandler({
                facetService,
                facetValueService,
            });

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', categoryId: 'cat-1' });

            expect(productVariantService.create).toHaveBeenCalledWith(ctx, [
                expect.not.objectContaining({ facetValueIds: expect.anything() }),
            ]);
        });

        it("on update, replaces only the category facet-value slot, keeping the variant's other facet values", async () => {
            const connection = makeConnection('existing-product-id');
            const productVariantService = {
                getVariantsByProductId: vi.fn().mockResolvedValue({ items: [{ id: 'variant-1' }] }),
                create: vi.fn(),
                update: vi.fn().mockResolvedValue([{}]),
                findOne: vi.fn().mockResolvedValue({
                    id: 'variant-1',
                    facetValues: [
                        { id: 'fv-old-category', facetId: 'facet-category' },
                        { id: 'fv-unrelated', facetId: 'facet-other' },
                    ],
                }),
            };
            const productService = { create: vi.fn(), update: vi.fn().mockResolvedValue({}) };
            const { facetService, facetValueService } = makeFacetServices([
                { id: 'fv-new-category', code: 'cat-2' },
            ]);
            const { handler } = makeHandler({
                connection,
                productService,
                productVariantService,
                facetService,
                facetValueService,
            });

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', categoryId: 'cat-2' });

            expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
                expect.objectContaining({
                    id: 'variant-1',
                    facetValueIds: ['fv-unrelated', 'fv-new-category'],
                }),
            ]);
        });
    });

    // issue #116 — `manufacturer` (the one Tier 2 field shipped this round; the rest await a real
    // per-field entity design, see product-tier2-fields.ts's own comment)
    describe('manufacturer field', () => {
        it('maps manufacturer onto the created Product customFields', async () => {
            const { handler, productService } = makeHandler();

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', manufacturer: 'Acme' });

            expect(productService.create).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({
                    customFields: expect.objectContaining({ manufacturer: 'Acme' }),
                }),
            );
        });

        it('omits manufacturer entirely when the payload carries none (proto3 optional-unset omission)', async () => {
            const { handler, productService } = makeHandler();

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget' });

            expect(productService.create).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ customFields: { externalId: 'p-1' } }),
            );
        });

        it('also maps manufacturer on the update path', async () => {
            const connection = makeConnection('existing-product-id');
            const productVariantService = {
                getVariantsByProductId: vi.fn().mockResolvedValue({ items: [{ id: 'variant-1' }] }),
                create: vi.fn(),
                update: vi.fn().mockResolvedValue([{}]),
                findOne: vi.fn().mockResolvedValue({ id: 'variant-1', facetValues: [] }),
            };
            const productService = { create: vi.fn(), update: vi.fn().mockResolvedValue({}) };
            const { handler } = makeHandler({ connection, productService, productVariantService });

            await handler.apply(ctx, 'p-1', { sku: 'SKU-1', name: 'Widget', manufacturer: 'Acme' });

            expect(productService.update).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ customFields: { manufacturer: 'Acme' } }),
            );
        });
    });
});
