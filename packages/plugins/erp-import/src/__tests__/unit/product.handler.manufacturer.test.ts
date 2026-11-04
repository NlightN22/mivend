import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ProductHandler } from '../../handlers/product.handler';
import { ManufacturerHandler } from '../../handlers/manufacturer.handler';

const ctx = {} as RequestContext;
const record = {
    externalId: 'prod-1',
    sku: 'SKU-1',
    name: 'Product 1',
    slug: 'product-1',
    price: 10,
    stockOnHand: 5,
};

function build(existing: { id: string } | undefined) {
    const qb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne: vi.fn(async () => existing),
    };
    const connection = { getRepository: () => ({ manager: { createQueryBuilder: () => qb } }) };
    const productService = {
        create: vi.fn(async () => ({ id: '1' })),
        update: vi.fn(async () => ({})),
    };
    const productVariantService = {
        create: vi.fn(async () => []),
        update: vi.fn(async () => []),
        getVariantsByProductId: vi.fn(async () => ({ items: [] })),
    };
    const globalSettingsService = { getSettings: vi.fn(async () => ({ customFields: {} })) };
    const manufacturerService = { ensureReference: vi.fn(async () => ({ id: 42 })) };
    const handler = new ProductHandler(
        connection as never,
        productService as never,
        productVariantService as never,
        {} as never,
        {} as never,
        globalSettingsService as never,
        manufacturerService as never,
    );
    return { handler, productService, manufacturerService };
}

describe('ProductHandler manufacturer link', () => {
    it('links a new product to the manufacturer referenced by manufacturerCode', async () => {
        const { handler, productService, manufacturerService } = build(undefined);
        await handler.upsert(ctx, { ...record, manufacturerCode: 'manufacturer-a' });
        expect(manufacturerService.ensureReference).toHaveBeenCalledWith(ctx, 'manufacturer-a');
        expect(productService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                customFields: expect.objectContaining({ manufacturerId: '42' }),
            }),
        );
    });

    it('keeps an existing link untouched when the record has no manufacturerCode', async () => {
        const { handler, productService, manufacturerService } = build({ id: '1' });
        await handler.upsert(ctx, record);
        expect(manufacturerService.ensureReference).not.toHaveBeenCalled();
        const input = productService.update.mock.calls[0] as unknown as [
            unknown,
            { customFields: Record<string, unknown> },
        ];
        expect(input[1].customFields).not.toHaveProperty('manufacturerId');
    });
});

describe('ProductHandler manufacturer part number', () => {
    it('stores it on create and on update, and leaves it alone when absent', async () => {
        const created = build(undefined);
        await created.handler.upsert(ctx, { ...record, manufacturerPartNumber: 'MPN-1' });
        expect(created.productService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                customFields: expect.objectContaining({ manufacturerPartNumber: 'MPN-1' }),
            }),
        );
        const updated = build({ id: '1' });
        await updated.handler.upsert(ctx, { ...record, manufacturerPartNumber: 'MPN-2' });
        await updated.handler.upsert(ctx, record);
        const fields = (
            updated.productService.update.mock.calls as unknown as Array<
                [unknown, { customFields: Record<string, unknown> }]
            >
        ).map(call => call[1].customFields);
        expect(fields[0].manufacturerPartNumber).toBe('MPN-2');
        expect(fields[1]).not.toHaveProperty('manufacturerPartNumber');
    });
});

describe('ManufacturerHandler', () => {
    it('delegates to the shared manufacturer upsert keyed by code', async () => {
        const manufacturerService = { upsert: vi.fn(async () => ({})) };
        const handler = new ManufacturerHandler(manufacturerService as never);
        await handler.upsert(ctx, { code: 'manufacturer-a', name: 'Manufacturer A' });
        expect(manufacturerService.upsert).toHaveBeenCalledWith(
            ctx,
            'manufacturer-a',
            'Manufacturer A',
            true,
        );
    });
});
