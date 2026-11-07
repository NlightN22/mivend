import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';

import { SavedTableView } from './entities/saved-table-view.entity';
import { SavedViewsService, SaveTableViewInput, UpdateTableViewInput } from './saved-views.service';

@Resolver()
export class SavedViewsResolver {
    constructor(private savedViewsService: SavedViewsService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async tableViews(
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
        @Args() args: SaveTableViewInput,
    ): Promise<SavedTableView> {
        return this.savedViewsService.save(ctx, args);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async updateTableView(
        @Ctx() ctx: RequestContext,
        @Args() args: UpdateTableViewInput,
    ): Promise<SavedTableView | null> {
        return this.savedViewsService.update(ctx, args);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async setTableViewDefault(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; isDefault: boolean },
    ): Promise<SavedTableView | null> {
        return this.savedViewsService.setDefault(ctx, args.id, args.isDefault);
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
