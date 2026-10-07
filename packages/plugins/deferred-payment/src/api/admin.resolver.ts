import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Order, Permission, RequestContext } from '@vendure/core';

import { CreditFlagService } from '../credit-flag.service';

@Resolver('Order')
export class OrderCreditFlagResolver {
    constructor(private readonly creditFlagService: CreditFlagService) {}

    @ResolveField()
    @Allow(Permission.ReadOrder)
    creditLimitExceeded(@Ctx() ctx: RequestContext, @Parent() order: Order): Promise<boolean> {
        return this.creditFlagService.isOrderFlagged(ctx, order.id);
    }
}

@Resolver()
export class CreditFlagAdminResolver {
    constructor(private readonly creditFlagService: CreditFlagService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    creditLimitExceededCounterpartyIds(@Ctx() ctx: RequestContext): Promise<string[]> {
        return this.creditFlagService.flaggedCounterpartyIds(ctx);
    }
}
