import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { SettlementAdminListService } from './settlement-admin-list.service';
import { SettlementShopService } from './settlement-shop.service';
import type {
    SettlementListOptions,
    SettlementListPage,
    SettlementTypeCount,
} from './settlement-admin.types';
import type { CounterpartyOverdue } from './settlement-shop.types';

// The list queries follow the credit permission, and the counterparty visibility scope on top of it.
@Resolver()
export class SettlementAdminResolver {
    constructor(
        private readonly shopService: SettlementShopService,
        private readonly counterparties: CounterpartyService,
        private readonly listService: SettlementAdminListService,
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

    @Query()
    @Allow(CustomPermission.ReadCounterpartyCredit.Permission)
    visibleSettlementDocuments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: SettlementListOptions; counterpartyId?: string },
    ): Promise<SettlementListPage> {
        return this.listService.findVisible(ctx, args.options, args.counterpartyId);
    }

    @Query()
    @Allow(CustomPermission.ReadCounterpartyCredit.Permission)
    visibleSettlementTypeCounts(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: SettlementListOptions; counterpartyId?: string },
    ): Promise<SettlementTypeCount[]> {
        return this.listService.typeCounts(ctx, args.options, args.counterpartyId);
    }
}
