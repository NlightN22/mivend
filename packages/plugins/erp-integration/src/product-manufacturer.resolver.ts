import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import {
    ProductManufacturerService,
    ProductManufacturerView,
} from './product-manufacturer.service';

@Resolver('Product')
export class ProductManufacturerResolver {
    constructor(private productManufacturerService: ProductManufacturerService) {}

    @ResolveField()
    manufacturer(
        @Ctx() ctx: RequestContext,
        @Parent() product: { id: string },
    ): Promise<ProductManufacturerView | null> {
        return this.productManufacturerService.getForProduct(ctx, product.id);
    }
}

@Resolver('SearchResult')
export class SearchResultManufacturerResolver {
    constructor(private productManufacturerService: ProductManufacturerService) {}

    @ResolveField()
    manufacturer(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productId: string },
    ): Promise<ProductManufacturerView | null> {
        return this.productManufacturerService.getForProduct(ctx, result.productId);
    }
}
