import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import type { CheckResult } from '@mivend/plugin-checks';

import { OrderChecksService } from './order-checks.service';

@Resolver()
export class OrderChecksResolver {
    constructor(private orderChecks: OrderChecksService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ReadCheckResults.Permission)
    recomputeOrderChecks(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<CheckResult[]> {
        return this.orderChecks.recompute(ctx, String(args.orderId));
    }
}
