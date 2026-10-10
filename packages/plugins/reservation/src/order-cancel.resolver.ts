import { Args, Mutation, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { OrderCancelEntryService } from './order-cancel-entry.service';
import type { OrderCancelResult } from './order-cancel-entry.result';

@Resolver('OrderCancelResult')
export class OrderCancelResultResolver {
    @ResolveField()
    __resolveType(value: OrderCancelResult): string {
        return value.__typename;
    }
}

@Resolver()
export class ShopCancelOrderResolver {
    constructor(private entryService: OrderCancelEntryService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Owner)
    async cancelOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string },
    ): Promise<OrderCancelResult> {
        return this.entryService.cancelAsCustomer(ctx, args.code);
    }
}

@Resolver()
export class AdminCancelOrderResolver {
    constructor(private entryService: OrderCancelEntryService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.CancelOrder.Permission)
    async cancelOrderAsStaff(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<OrderCancelResult> {
        return this.entryService.cancelAsStaff(ctx, args.orderId);
    }
}
