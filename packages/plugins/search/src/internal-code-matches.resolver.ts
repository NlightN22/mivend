import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Collection, Ctx, FacetValue, RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { CodeMatches, InternalCodeMatchesService } from './internal-code-matches.service';

interface SearchParent {
    input: SearchInput;
}

@Resolver('SearchResponse')
export class ShopCodeMatchesResolver {
    constructor(private matches: InternalCodeMatchesService) {}

    @ResolveField()
    skuMatches(@Ctx() ctx: RequestContext, @Parent() p: SearchParent): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'sku', true);
    }

    @ResolveField()
    partNumberMatches(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'partNumber', true);
    }

    @ResolveField()
    manufacturerCodeMatches(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'manufacturerCode', true);
    }
}

@Resolver('SearchResponse')
export class AdminCodeMatchesResolver {
    constructor(private matches: InternalCodeMatchesService) {}

    @ResolveField()
    facetValues(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<Array<{ facetValue: FacetValue; count: number }>> {
        return this.matches.facetValues(ctx, p.input);
    }

    @ResolveField()
    collections(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<Array<{ collection: Collection; count: number }>> {
        return this.matches.collections(ctx, p.input);
    }

    @ResolveField()
    skuMatches(@Ctx() ctx: RequestContext, @Parent() p: SearchParent): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'sku', false);
    }

    @ResolveField()
    partNumberMatches(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'partNumber', false);
    }

    @ResolveField()
    manufacturerCodeMatches(
        @Ctx() ctx: RequestContext,
        @Parent() p: SearchParent,
    ): Promise<CodeMatches | null> {
        return this.matches.find(ctx, p.input, 'manufacturerCode', false);
    }
}
