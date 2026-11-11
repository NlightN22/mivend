import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { StaffSearchService } from './staff-search.service';
import type { GlobalSearchGroup } from './types';

// Any signed-in admin may ask; each kind is gated by its own read permission inside the service.
@Resolver()
export class StaffSearchResolver {
    constructor(private readonly service: StaffSearchService) {}

    @Query()
    @Allow(Permission.Authenticated)
    globalSearch(
        @Ctx() ctx: RequestContext,
        @Args() args: { term: string; limitPerKind?: number },
    ): Promise<GlobalSearchGroup[]> {
        return this.service.search(ctx, args.term, args.limitPerKind);
    }
}
