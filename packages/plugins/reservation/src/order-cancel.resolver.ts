import { Args, Mutation, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { OrderCancelEntryService } from './order-cancel-entry.service';
import type { CancelOrderResult } from './order-cancel-entry.result';

@Resolver('CancelOrderResult')
export class CancelOrderResultResolver {
    @ResolveField()
    __resolveType(value: CancelOrderResult): string {
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
    ): Promise<CancelOrderResult> {
        return this.entryService.cancelAsCustomer(ctx, args.code);
    }
}

@Resolver()
export class AdminCancelOrderResolver {
    constructor(private entryService: OrderCancelEntryService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.CancelOrder.Permission)
    async cancelOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<CancelOrderResult> {
        return this.entryService.cancelAsStaff(ctx, args.orderId);
    }
}
