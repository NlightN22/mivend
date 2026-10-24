import { ResolveField, Parent, Resolver } from '@nestjs/graphql';
import {
    Ctx,
    FacetValue,
    FacetValueService,
    Product,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
} from '@vendure/core';

import { HiddenCategoryFacetValuesService } from './hidden-category-facet-values.service';

// Mirrors core's Shop facetValues rules (private facets dropped) plus hidden categories.
@Resolver('Product')
export class ShopProductFacetValuesResolver {
    constructor(
        private productService: ProductService,
        private facetValueService: FacetValueService,
        private hidden: HiddenCategoryFacetValuesService,
    ) {}

    @ResolveField()
    async facetValues(
        @Ctx() ctx: RequestContext,
        @Parent() product: Product,
    ): Promise<FacetValue[]> {
        const own = await this.productService.getFacetValuesForProduct(ctx, product.id);
        const found = await this.facetValueService.findByIds(
            ctx,
            own.map(fv => fv.id),
        );
        const visible = found.filter(fv => !fv.facet.isPrivate);
        const hiddenIds = await this.hidden.findHiddenIds(
            ctx,
            visible.map(fv => fv.id),
        );
        return visible.filter(fv => !hiddenIds.has(String(fv.id)));
    }
}

@Resolver('ProductVariant')
export class ShopVariantFacetValuesResolver {
    constructor(
        private variantService: ProductVariantService,
        private hidden: HiddenCategoryFacetValuesService,
    ) {}

    @ResolveField()
    async facetValues(
        @Ctx() ctx: RequestContext,
        @Parent() variant: ProductVariant,
    ): Promise<FacetValue[]> {
        const own = await this.variantService.getFacetValuesForVariant(ctx, variant.id);
        const visible = own.filter(
            fv =>
                !fv.facet.isPrivate &&
                fv.channels.some(c => String(c.id) === String(ctx.channelId)),
        );
        const hiddenIds = await this.hidden.findHiddenIds(
            ctx,
            visible.map(fv => fv.id),
        );
        return visible.filter(fv => !hiddenIds.has(String(fv.id)));
    }
}
