import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
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

// Admin dashboard also calls the index-maintenance operations; there is no local index under
// SEARCH_BACKEND=external, so they are no-ops (nothing pending, reindex completes immediately).
@Resolver()
export class ExternalAdminSearchResolver {
    constructor(private externalSearchService: ExternalSearchService) {}

    @Query()
    @Allow(Permission.ReadCatalog, Permission.ReadProduct)
    async search(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SearchInput,
    ): Promise<ExternalSearchResponse> {
        return this.externalSearchService.search(ctx, input, true);
    }

    @Query()
    @Allow(Permission.ReadCatalog, Permission.ReadProduct)
    pendingSearchIndexUpdates(): number {
        return 0;
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog, Permission.UpdateProduct)
    runPendingSearchIndexUpdates(): { success: boolean } {
        return { success: true };
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog, Permission.UpdateProduct)
    reindex(): Record<string, unknown> {
        const now = new Date();
        return {
            id: 'external-search-noop',
            queueName: 'external-search',
            state: 'COMPLETED',
            progress: 100,
            retries: 0,
            attempts: 1,
            createdAt: now,
            startedAt: now,
            settledAt: now,
            isSettled: true,
            duration: 0,
        };
    }
}
