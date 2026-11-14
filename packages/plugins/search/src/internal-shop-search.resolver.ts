import { ModuleRef } from '@nestjs/core';
import { Args, Query, Resolver } from '@nestjs/graphql';
import type { SearchInput } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';
import { HiddenCategoryProductsService } from '@mivend/plugin-access-control';

import { CategorySubtreeService } from './category-subtree.service';
import { assertSearchDepth } from './search-end-user-id';

// Replaces the Elasticsearch plugin's shop `search`: the input carries the hidden category values
// and subtree-wide category filters, so hits, counts, code groups and facets agree.
@Resolver()
export class InternalShopSearchResolver {
    constructor(
        private moduleRef: ModuleRef,
        private hidden: HiddenCategoryProductsService,
        private subtree: CategorySubtreeService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async search(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SearchInput,
    ): Promise<Record<string, unknown>> {
        assertSearchDepth(input.skip);
        const scoped = {
            ...(await this.subtree.expand(ctx, input)),
            hiddenFacetValueIds: await this.hidden.hiddenFacetValueIds(ctx),
        };
        const elasticsearch = this.moduleRef.get(ElasticsearchService, { strict: false });
        const result = await elasticsearch.search(ctx, scoped, true);
        return { ...result, input: scoped };
    }
}
