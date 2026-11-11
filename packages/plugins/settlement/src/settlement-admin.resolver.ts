import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { SettlementAdminListService } from './settlement-admin-list.service';
import { SettlementDocumentTypeService } from './settlement-document-type.service';
import { SettlementSuggestService } from './settlement-suggest.service';
import { SettlementShopService } from './settlement-shop.service';
import type {
    SettlementListOptions,
    SettlementDocumentTypeInfo,
    SettlementListPage,
    SettlementTypeCount,
} from './settlement-admin.types';
import type { CounterpartyOverdue } from './settlement-shop.types';

// The list queries have their own permission, not ReadCounterpartyCredit (which also exposes credit
// limits and balances); the counterparty visibility scope applies on top of it.
@Resolver()
export class SettlementAdminResolver {
    constructor(
        private readonly shopService: SettlementShopService,
        private readonly counterparties: CounterpartyService,
        private readonly listService: SettlementAdminListService,
        private readonly suggestService: SettlementSuggestService,
        private readonly documentTypes: SettlementDocumentTypeService,
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
    @Allow(CustomPermission.ReadSettlementDocument.Permission)
    visibleSettlementDocuments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: SettlementListOptions; counterpartyId?: string },
    ): Promise<SettlementListPage> {
        return this.listService.findVisible(ctx, args.options, args.counterpartyId);
    }

    @Query()
    @Allow(CustomPermission.ReadSettlementDocument.Permission)
    visibleSettlementTypeCounts(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: SettlementListOptions; counterpartyId?: string },
    ): Promise<SettlementTypeCount[]> {
        return this.listService.typeCounts(ctx, args.options, args.counterpartyId);
    }

    @Query()
    @Allow(CustomPermission.ReadSettlementDocument.Permission)
    settlementDocumentTypes(@Ctx() ctx: RequestContext): Promise<SettlementDocumentTypeInfo[]> {
        return this.documentTypes.listAll(ctx);
    }

    @Query()
    @Allow(CustomPermission.ReadSettlementDocument.Permission)
    settlementFilterSuggestions(
        @Ctx() ctx: RequestContext,
        @Args() args: { field: string; prefix: string; limit?: number },
    ): Promise<string[]> {
        return this.suggestService.suggest(ctx, args.field, args.prefix, args.limit);
    }
}
