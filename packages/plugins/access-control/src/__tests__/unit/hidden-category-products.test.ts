import { describe, expect, it, vi } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';
import type { Injector } from '@vendure/core';

import { HiddenCategoryOrderInterceptor } from '../../hidden-category-order.interceptor';
import { HiddenCategoryProductsService } from '../../hidden-category-products.service';
import {
    ShopCollectionVisibleVariantsResolver,
    ShopVisibleProductsResolver,
} from '../../shop-visible-products.resolver';

const shopCtx = { apiType: 'shop' } as unknown as RequestContext;
const adminCtx = { apiType: 'admin' } as unknown as RequestContext;
const hiddenIds = (...ids: number[]) => ({
    hiddenProductIds: vi.fn().mockResolvedValue(new Set(ids.map(String))),
});

describe('HiddenCategoryProductsService', () => {
    it('answers without a query for no product ids', async () => {
        const query = vi.fn();
        const service = new HiddenCategoryProductsService({
            getRepository: () => ({ query }),
        } as never);
        expect((await service.hiddenProductIds(shopCtx, [])).size).toBe(0);
        expect(query).not.toHaveBeenCalled();
    });

    it('returns the ids the query reports as hidden, as strings', async () => {
        const query = vi.fn().mockResolvedValue([{ id: 7 }]);
        const service = new HiddenCategoryProductsService({
            getRepository: () => ({ query }),
        } as never);
        expect([...(await service.hiddenProductIds(shopCtx, [7, 8]))]).toEqual(['7']);
        expect(query.mock.calls[0][1]).toEqual([[7, 8]]);
    });
});

describe('HiddenCategoryOrderInterceptor', () => {
    const input = { productVariant: { productId: 5 } } as never;
    const build = (hidden: ReturnType<typeof hiddenIds>): HiddenCategoryOrderInterceptor => {
        const interceptor = new HiddenCategoryOrderInterceptor();
        interceptor.init({ get: () => hidden } as unknown as Injector);
        return interceptor;
    };

    it('rejects a hidden-category product for a customer', async () => {
        const result = await build(hiddenIds(5)).willAddItemToOrder(shopCtx, {} as Order, input);
        expect(result).toBe('error.product-not-available');
    });

    it('lets a customer add a visible product', async () => {
        expect(
            await build(hiddenIds()).willAddItemToOrder(shopCtx, {} as Order, input),
        ).toBeUndefined();
    });

    it('does not check staff adding through the admin API', async () => {
        const hidden = hiddenIds(5);
        expect(
            await build(hidden).willAddItemToOrder(adminCtx, {} as Order, input),
        ).toBeUndefined();
        expect(hidden.hiddenProductIds).not.toHaveBeenCalled();
    });
});

describe('ShopVisibleProductsResolver', () => {
    const product = (id: number, enabled = true) => ({ id, enabled, facetValues: [] });
    const build = (items: ReturnType<typeof product>[], hidden: number[]) => {
        const productService = {
            findAll: vi.fn().mockResolvedValue({ items, totalItems: items.length }),
            findOne: vi.fn().mockResolvedValue(items[0]),
            findOneBySlug: vi.fn().mockResolvedValue(items[0]),
        };
        return {
            productService,
            resolver: new ShopVisibleProductsResolver(
                productService as never,
                hiddenIds(...hidden) as never,
            ),
        };
    };

    it('drops hidden-category products from the list and from the total', async () => {
        const { resolver, productService } = build([product(1), product(2), product(3)], [2]);
        const result = await resolver.products(shopCtx, { options: {} }, []);
        expect(result.items.map(p => p.id)).toEqual([1, 3]);
        expect(result.totalItems).toBe(2);
        expect(productService.findAll.mock.calls[0][1]).toEqual({
            filter: { enabled: { eq: true } },
            filterOperator: undefined,
        });
    });

    it('keeps the enabled guard outside a caller filter combined with OR', async () => {
        const { resolver, productService } = build([product(1)], []);
        await resolver.products(
            shopCtx,
            { options: { filter: { id: { in: ['1'] } }, filterOperator: 'OR' as never } },
            [],
        );
        expect(productService.findAll.mock.calls[0][1].filter).toEqual({
            _and: [{ _or: [{ id: { in: ['1'] } }] }, { enabled: { eq: true } }],
        });
    });

    it.each([
        ['id', { id: '1' }],
        ['slug', { slug: 'p' }],
    ])('answers a hidden-category product by %s like a missing one', async (_name, args) => {
        const { resolver } = build([product(1)], [1]);
        expect(await resolver.product(shopCtx, args, [])).toBeUndefined();
    });

    it('returns a visible product and still hides a disabled one', async () => {
        expect((await build([product(1)], []).resolver.product(shopCtx, { id: '1' }, []))?.id).toBe(
            1,
        );
        expect(
            await build([product(1, false)], []).resolver.product(shopCtx, { id: '1' }, []),
        ).toBeUndefined();
    });

    it('requires an id or a slug', async () => {
        await expect(build([], []).resolver.product(shopCtx, {}, [])).rejects.toThrow();
    });
});

describe('ShopCollectionVisibleVariantsResolver', () => {
    it('drops variants of hidden-category products and adjusts the total', async () => {
        const variantService = {
            getVariantsByCollectionId: vi.fn().mockResolvedValue({
                items: [
                    { id: 1, productId: 10 },
                    { id: 2, productId: 11 },
                ],
                totalItems: 2,
            }),
        };
        const resolver = new ShopCollectionVisibleVariantsResolver(
            variantService as never,
            hiddenIds(11) as never,
        );
        const result = await resolver.productVariants(shopCtx, { id: 4 } as never, {}, []);
        expect(result.items.map(v => v.id)).toEqual([1]);
        expect(result.totalItems).toBe(1);
        expect(variantService.getVariantsByCollectionId.mock.calls[0][2]).toEqual({
            filter: { enabled: { eq: true } },
        });
    });
});
