import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, ForbiddenError, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import type { CheckResult } from '@mivend/plugin-checks';

import { OrderChecksService } from './order-checks.service';

@Resolver()
export class OrderChecksResolver {
    constructor(private orderChecks: OrderChecksService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ReadCheckResults.Permission)
    async recomputeOrderChecks(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<CheckResult[]> {
        // @Allow is any-of; the recompute writes results and takes the order lock, so it also needs the staff edit permission.
        if (!ctx.userHasPermissions([CustomPermission.ConfirmOrder.Permission])) {
            throw new ForbiddenError();
        }
        return this.orderChecks.recompute(ctx, String(args.orderId));
    }
}
