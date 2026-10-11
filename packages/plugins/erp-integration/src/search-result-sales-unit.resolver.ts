import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { VariantSalesUnitService } from './variant-sales-unit.service';

@Resolver('SearchResult')
export class SearchResultSalesUnitResolver {
    constructor(private readonly variantSalesUnitService: VariantSalesUnitService) {}

    @ResolveField()
    async unitName(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<string | null> {
        return (
            (await this.variantSalesUnitService.load(ctx, String(result.productVariantId)))
                ?.unitName ?? null
        );
    }

    @ResolveField()
    async unitRatioToBase(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<number | null> {
        return (
            (await this.variantSalesUnitService.load(ctx, String(result.productVariantId)))
                ?.unitRatioToBase ?? null
        );
    }

    @ResolveField()
    async multiplicity(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<number | null> {
        return (
            (await this.variantSalesUnitService.load(ctx, String(result.productVariantId)))
                ?.multiplicity ?? null
        );
    }
}
