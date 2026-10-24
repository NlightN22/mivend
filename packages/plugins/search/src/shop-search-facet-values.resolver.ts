import { ModuleRef } from '@nestjs/core';
import { ResolveField, Parent, Resolver } from '@nestjs/graphql';
import { Collection, Ctx, FacetValue, RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';
import { HiddenCategoryFacetValuesService } from '@mivend/plugin-access-control';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';

interface FacetValueResult {
    facetValue: FacetValue;
    count: number;
}

interface CollectionResult {
    collection: Collection;
    count: number;
}

interface SearchParent {
    input: SearchInput;
    facetValues?: FacetValueResult[];
    collections?: CollectionResult[];
}

// Shop-side override for both backends: external returns the lists on the parent, Elasticsearch
// computes them lazily from the input (its own resolver is replaced, so we call the same service).
@Resolver('SearchResponse')
export class ShopSearchFacetValuesResolver {
    constructor(
        private hidden: HiddenCategoryFacetValuesService,
        private moduleRef: ModuleRef,
    ) {}

    @ResolveField()
    async facetValues(
        @Ctx() ctx: RequestContext,
        @Parent() parent: SearchParent,
    ): Promise<FacetValueResult[]> {
        const results =
            parent.facetValues ??
            (await this.elasticsearch().facetValues(ctx, parent.input, true)).filter(
                r => !r.facetValue.facet.isPrivate,
            );
        const hiddenIds = await this.hidden.findHiddenIds(
            ctx,
            results.map(r => r.facetValue.id),
        );
        return results.filter(r => !hiddenIds.has(String(r.facetValue.id)));
    }

    @ResolveField()
    async collections(
        @Ctx() ctx: RequestContext,
        @Parent() parent: SearchParent,
    ): Promise<CollectionResult[]> {
        const results =
            parent.collections ?? (await this.elasticsearch().collections(ctx, parent.input, true));
        const privateIds = await this.hidden.findPrivateCollectionIds(
            ctx,
            results.map(r => r.collection.id),
        );
        return results.filter(r => !privateIds.has(String(r.collection.id)));
    }

    private elasticsearch(): ElasticsearchService {
        return this.moduleRef.get(ElasticsearchService, { strict: false });
    }
}
