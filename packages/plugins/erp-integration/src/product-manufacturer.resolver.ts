import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { ProductGalleryService } from './product-gallery.service';
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

@Resolver('SearchResult')
export class SearchResultGalleryResolver {
    constructor(private productGalleryService: ProductGalleryService) {}

    @ResolveField()
    galleryPreviews(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productId: string },
    ): Promise<string[]> {
        return this.productGalleryService.getPreviews(ctx, result.productId);
    }
}
