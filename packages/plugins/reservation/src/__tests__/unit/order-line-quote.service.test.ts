import { EntityNotFoundError, UserInputError } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { OrderLineQuoteService } from '../../order-line-quote.service';

const ctx = {} as never;

function build(opts: {
    visible?: boolean;
    variants?: Array<{ id: string; sku: string }>;
    quote?: unknown;
    quoteFn?: ReturnType<typeof vi.fn>;
    free?: Map<string, Map<string, number>>;
}) {
    const variants = opts.variants ?? [{ id: '7', sku: 'AB-1' }];
    const qb = {
        where: () => qb,
        andWhere: () => qb,
        limit: () => qb,
        getMany: async () => variants,
    };
    const connection = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    const orderService = {
        findOne: async () => ({
            id: '5',
            customFields: { branchId: 'branch-a' },
            lines: [
                { productVariantId: '7', quantity: 4 },
                { productVariantId: '8', quantity: 9 },
            ],
        }),
    };
    const visibility = {
        visibleIds: async () => new Set(opts.visible === false ? [] : ['5']),
    };
    const availability = {
        findBranchStockLocationIds: vi.fn(async () => ['1', '2']),
        getFreeByLocation: vi.fn(
            async () =>
                opts.free ??
                new Map([
                    [
                        '7',
                        new Map([
                            ['1', 3],
                            ['2', 9],
                        ]),
                    ],
                ]),
        ),
    };
    const quoteFn =
        opts.quoteFn ??
        vi.fn(async () =>
            opts.quote === undefined ? { customerPrice: 1000, referencePrice: 1000 } : opts.quote,
        );
    const priceCheck = { quote: quoteFn };
    const service = new OrderLineQuoteService(
        connection as never,
        orderService as never,
        { findOne: async () => ({ name: 'One' }) } as never,
        visibility as never,
        availability as never,
        { get: () => priceCheck } as never,
    );
    return { service, availability, quoteFn };
}

describe('OrderLineQuoteService', () => {
    it('quotes the customer price and the best free stock of the branch warehouses', async () => {
        const { service, availability } = build({});
        expect(await service.quote(ctx, '5', 'AB-1')).toEqual({
            variantId: '7',
            sku: 'AB-1',
            name: 'One',
            customerPrice: 1000,
            referencePrice: 1000,
            available: 9,
        });
        expect(availability.findBranchStockLocationIds).toHaveBeenCalledWith(ctx, 'branch-a');
    });

    it('quotes for the quantity the merged line would have, existing plus the given one', async () => {
        const t = build({});
        await t.service.quote(ctx, '5', 'AB-1');
        await t.service.quote(ctx, '5', 'AB-1', 100);
        expect(t.quoteFn.mock.calls.map(c => c[3])).toEqual([5, 104]);
    });

    it.each([0, -1, 1.5, 2_000_000])('refuses the quantity %s', async quantity => {
        await expect(build({}).service.quote(ctx, '5', 'AB-1', quantity)).rejects.toThrow(
            /whole number from 1/,
        );
    });

    it('reports no stock when the warehouses hold none of it', async () => {
        const { service } = build({ free: new Map() });
        expect((await service.quote(ctx, '5', 'AB-1')).available).toBe(0);
    });

    it('does not reveal an order outside the caller scope', async () => {
        const { service } = build({ visible: false });
        await expect(service.quote(ctx, '5', 'AB-1')).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('refuses an article with no customer price like the add does', async () => {
        const { service } = build({ quote: null });
        await expect(service.quote(ctx, '5', 'AB-1')).rejects.toThrow(
            'AB-1 has no price for this customer and cannot be added',
        );
    });

    it('refuses an unknown and an ambiguous article', async () => {
        await expect(build({ variants: [] }).service.quote(ctx, '5', 'AB-1')).rejects.toThrow(
            'No product with the article AB-1',
        );
        const two = build({
            variants: [
                { id: '1', sku: 'AB-1' },
                { id: '2', sku: 'AB-1' },
            ],
        });
        await expect(two.service.quote(ctx, '5', 'AB-1')).rejects.toBeInstanceOf(UserInputError);
    });
});
