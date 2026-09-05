import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { ExternalSearchResponse, ExternalSearchService } from './external-search.service';

// Provides the shop-api `Query.search` resolver when SEARCH_BACKEND=external — the same seam
// ElasticsearchPlugin fills for SEARCH_BACKEND=internal (`search` is declared in Vendure core's
// base shop-api schema with no default resolver; see the backend-plugin-rules skill's plugin
// layout and issue #69). Only ever registered for one backend at a time — see search.plugin.ts.
@Resolver()
export class ExternalSearchResolver {
    constructor(private externalSearchService: ExternalSearchService) {}

    @Query()
    async search(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SearchInput,
    ): Promise<ExternalSearchResponse> {
        return this.externalSearchService.search(ctx, input);
    }
}
