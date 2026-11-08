import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';
import { CustomPermission } from '@mivend/plugin-access-control';

import { changeView } from './trading-point-change';
import { TradingPointChangeService } from './trading-point-change.service';

@Resolver()
export class TradingPointChangeAdminResolver {
    constructor(private changes: TradingPointChangeService) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async pendingTradingPointChanges(
        @Ctx() ctx: RequestContext,
    ): Promise<Array<Record<string, unknown>>> {
        return (await this.changes.listPending(ctx)).map(changeView);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async acceptTradingPointChange(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Record<string, unknown>> {
        return changeView(await this.changes.accept(ctx, args.id));
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async rejectTradingPointChange(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; comment?: string | null },
    ): Promise<Record<string, unknown>> {
        return changeView(await this.changes.reject(ctx, args.id, args.comment));
    }
}
