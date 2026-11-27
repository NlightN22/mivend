import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    Counterparty,
    CounterpartyErpDriftService,
    TradingPoint,
    TradingPointLocationReportService,
} from '@mivend/plugin-counterparty';

import { ReconciliationStateService } from './reconciliation-state.service';
import type { ReconciliationKindView } from './reconciliation-state.service';
import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import {
    OpenErpReconciliationIssueListOptions,
    ReconciliationService,
    RunComparisonResult,
} from './reconciliation.service';

@Resolver()
export class ReconciliationResolver {
    constructor(
        private reconciliationService: ReconciliationService,
        private locationReport: TradingPointLocationReportService,
        private counterpartyDrift: CounterpartyErpDriftService,
        private states: ReconciliationStateService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async tradingPointsWithoutLocation(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<TradingPoint>> {
        return this.locationReport.listMissing(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async tradingPointsDifferingFromErp(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<TradingPoint>> {
        return this.locationReport.listDifferingFromErp(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async tradingPointsNotConfirmedByErp(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<TradingPoint>> {
        return this.locationReport.listNotConfirmedByErp(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async counterpartiesDifferingFromErp(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<Counterparty>> {
        return this.counterpartyDrift.listDifferingFromErp(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async counterpartiesNotConfirmedByErp(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<Counterparty>> {
        return this.counterpartyDrift.listNotConfirmedByErp(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async counterpartiesWithUnlinkedManagers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<Counterparty>> {
        return this.counterpartyDrift.listWithUnlinkedManagers(ctx, args.options);
    }

    @Query()
    @Allow(
        CustomPermission.ManageErpIntegration.Permission,
        CustomPermission.ReadExchangeHealth.Permission,
    )
    async openErpReconciliationIssues(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenErpReconciliationIssueListOptions },
    ): Promise<PaginatedList<ErpReconciliationIssue>> {
        return this.reconciliationService.findOpen(ctx, args.options);
    }

    @Query()
    @Allow(
        CustomPermission.ManageErpIntegration.Permission,
        CustomPermission.ReadExchangeHealth.Permission,
    )
    async erpReconciliationStates(@Ctx() ctx: RequestContext): Promise<ReconciliationKindView[]> {
        return this.states.listViews(ctx);
    }

    @Mutation()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async runErpReconciliation(@Ctx() ctx: RequestContext): Promise<RunComparisonResult> {
        return this.reconciliationService.runComparison({
            triggeredBy: 'manual',
            triggeredByAdministratorId: ctx.activeUserId ? String(ctx.activeUserId) : undefined,
        });
    }

    @Mutation()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async resolveErpReconciliationIssue(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; resolution: string },
    ): Promise<ErpReconciliationIssue> {
        return this.reconciliationService.resolve(ctx, args);
    }
}
