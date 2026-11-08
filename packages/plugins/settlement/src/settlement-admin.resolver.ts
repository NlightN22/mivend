import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { SettlementShopService } from './settlement-shop.service';
import type { CounterpartyOverdue } from './settlement-shop.types';

@Resolver()
export class SettlementAdminResolver {
    constructor(
        private readonly shopService: SettlementShopService,
        private readonly counterparties: CounterpartyService,
    ) {}

    // A finance figure, so it needs the credit right; an invisible counterparty answers like a missing one.
    @Query()
    @Allow(CustomPermission.ReadCounterpartyCredit.Permission)
    async counterpartyOverdue(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID },
    ): Promise<CounterpartyOverdue | null> {
        if (!(await this.counterparties.findOneVisible(ctx, args.counterpartyId))) return null;
        return this.shopService.overdue(ctx, String(args.counterpartyId));
    }
}
