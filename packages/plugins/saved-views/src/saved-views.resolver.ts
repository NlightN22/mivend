import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';

import { SavedTableView } from './entities/saved-table-view.entity';
import { SavedViewsService } from './saved-views.service';

@Resolver()
export class SavedViewsResolver {
    constructor(private savedViewsService: SavedViewsService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async myTableViews(
        @Ctx() ctx: RequestContext,
        @Args() args: { pageKey: string },
    ): Promise<SavedTableView[]> {
        return this.savedViewsService.findForCurrentAdministrator(ctx, args.pageKey);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async saveTableView(
        @Ctx() ctx: RequestContext,
        @Args() args: { pageKey: string; name: string; filters: string; visibleColumns: string[] },
    ): Promise<SavedTableView> {
        return this.savedViewsService.save(ctx, {
            pageKey: args.pageKey,
            name: args.name,
            filters: args.filters,
            visibleColumns: args.visibleColumns,
        });
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async deleteTableView(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<boolean> {
        return this.savedViewsService.delete(ctx, args.id);
    }
}
