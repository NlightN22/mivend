import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type {
    CollectionProductVariantsArgs,
    QueryProductArgs,
    QueryProductsArgs,
} from '@vendure/common/lib/generated-shop-types';
import {
    Collection,
    Ctx,
    PaginatedList,
    Product,
    ProductService,
    ProductVariant,
    ProductVariantService,
    Relations,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import type { RelationPaths } from '@vendure/core';

import { HiddenCategoryProductsService } from './hidden-category-products.service';

// Shop-side overrides of core's `products`, `product` and `Collection.productVariants`: a product in a
// hidden category answers like a missing one. Admin (staff) API is untouched.
@Resolver()
export class ShopVisibleProductsResolver {
    constructor(
        private productService: ProductService,
        private hidden: HiddenCategoryProductsService,
    ) {}

    @Query()
    async products(
        @Ctx() ctx: RequestContext,
        @Args() args: QueryProductsArgs,
        @Relations({ entity: Product, omit: ['variants', 'assets'] })
        relations: RelationPaths<Product>,
    ): Promise<PaginatedList<Product>> {
        const options = withEnabledGuard(args.options);
        const result = await this.productService.findAll(ctx, options, relations);
        const hiddenIds = await this.hidden.hiddenProductIds(
            ctx,
            result.items.map(p => p.id),
        );
        const items = result.items.filter(p => !hiddenIds.has(String(p.id)));
        return { items, totalItems: result.totalItems - hiddenIds.size };
    }

    @Query()
    async product(
        @Ctx() ctx: RequestContext,
        @Args() args: QueryProductArgs,
        @Relations({ entity: Product, omit: ['variants', 'assets'] })
        relations: RelationPaths<Product>,
    ): Promise<Product | undefined> {
        if (!args.id && !args.slug) {
            throw new UserInputError('error.product-id-or-slug-must-be-provided');
        }
        const result = args.id
            ? await this.productService.findOne(ctx, args.id, relations)
            : await this.productService.findOneBySlug(ctx, args.slug as string, relations);
        if (!result || result.enabled === false) return undefined;
        if ((await this.hidden.hiddenProductIds(ctx, [result.id])).size > 0) return undefined;
        const visible = result.facetValues?.filter(fv => !fv.facet.isPrivate);
        return Object.assign(result, { facetValues: visible });
    }
}

@Resolver('Collection')
export class ShopCollectionVisibleVariantsResolver {
    constructor(
        private variantService: ProductVariantService,
        private hidden: HiddenCategoryProductsService,
    ) {}

    @ResolveField()
    async productVariants(
        @Ctx() ctx: RequestContext,
        @Parent() collection: Collection,
        @Args() args: CollectionProductVariantsArgs,
        @Relations({ entity: ProductVariant, omit: ['assets'] })
        relations: RelationPaths<ProductVariant>,
    ): Promise<PaginatedList<ProductVariant>> {
        const options = {
            ...args.options,
            filter: { ...args.options?.filter, enabled: { eq: true } },
        };
        const result = await this.variantService.getVariantsByCollectionId(
            ctx,
            collection.id,
            options,
            relations,
        );
        const hiddenIds = await this.hidden.hiddenProductIds(
            ctx,
            result.items.map(v => v.productId),
        );
        const items = result.items.filter(v => !hiddenIds.has(String(v.productId)));
        return { items, totalItems: result.totalItems - (result.items.length - items.length) };
    }
}

function withEnabledGuard(options: QueryProductsArgs['options']): QueryProductsArgs['options'] {
    const userFilter = options?.filter;
    const guard = { enabled: { eq: true } };
    if (!userFilter || Object.keys(userFilter).length === 0) {
        return { ...options, filter: guard, filterOperator: undefined };
    }
    const block = options?.filterOperator === 'OR' ? { _or: [userFilter] } : { _and: [userFilter] };
    return { ...options, filter: { _and: [block, guard] }, filterOperator: undefined };
}
