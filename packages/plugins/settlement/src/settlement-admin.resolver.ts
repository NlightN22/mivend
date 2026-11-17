import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { ManagerCardService, LOST_THRESHOLDS } from './manager-card.service';
import type { ManagerCard } from './manager-card.types';
import { CounterpartyMetricsService } from './counterparty-metrics.service';
import type { CounterpartyMetrics } from './counterparty-metrics.types';
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

// The list queries have their own permission, not ReadCounterpartyCredit; the counterparty visibility
// scope applies on top of it.
@Resolver()
export class SettlementAdminResolver {
    constructor(
        private readonly shopService: SettlementShopService,
        private readonly counterparties: CounterpartyService,
        private readonly listService: SettlementAdminListService,
        private readonly suggestService: SettlementSuggestService,
        private readonly documentTypes: SettlementDocumentTypeService,
        private readonly metrics: CounterpartyMetricsService,
        private readonly managerCards: ManagerCardService,
    ) {}

    // A finance figure behind the credit right (every default role has it); an invisible counterparty answers like a missing one.
    @Query()
    @Allow(CustomPermission.ReadCounterpartyCredit.Permission)
    async counterpartyOverdue(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID },
    ): Promise<CounterpartyOverdue | null> {
        if (!(await this.counterparties.findOneVisible(ctx, args.counterpartyId))) return null;
        return this.shopService.overdue(ctx, String(args.counterpartyId));
    }

    // Balances and turnover are finance figures: same right and scope guard as counterpartyOverdue.
    @Query()
    @Allow(CustomPermission.ReadCounterpartyCredit.Permission)
    async counterpartyMetrics(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID },
    ): Promise<CounterpartyMetrics | null> {
        if (!(await this.counterparties.findOneVisible(ctx, args.counterpartyId))) return null;
        return this.metrics.metrics(ctx, String(args.counterpartyId));
    }

    // Figures are bounded by the caller's counterparty scope; a manager outside it answers like a missing one.
    @Query()
    @Allow(CustomPermission.ReadManagerCard.Permission)
    async managerCard(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId: ID; lostAfterDays?: number },
    ): Promise<ManagerCard | null> {
        const administratorId = String(args.administratorId);
        const name = await this.managerCards.openName(ctx, administratorId);
        if (name === null) return null;
        const days = (LOST_THRESHOLDS as readonly number[]).includes(args.lostAfterDays ?? 90)
            ? (args.lostAfterDays ?? 90)
            : 90;
        return this.managerCards.card(ctx, administratorId, name, days);
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
