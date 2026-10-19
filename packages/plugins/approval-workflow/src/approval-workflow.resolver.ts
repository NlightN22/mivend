import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    ForbiddenError,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { CustomPermission, PriceTypeAccessService } from '@mivend/plugin-access-control';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { ApprovalRequestService } from './approval-request.service';
import { WorkflowDefinitionService, ParsedWorkflowDefinition } from './workflow-definition.service';
import { ApprovalListOptions, ApprovalStepDecision, WorkflowStepDefinition } from './types';
import { ApprovalStepService } from './approval-step.service';
import { ApprovalReadAccessService } from './approval-read-access.service';

// requestType is a fixed engine identifier, so its create permission is code, not a DB table.
// Approval chains are data-driven instead (WorkflowDefinition.stepsJson).
const CREATE_PERMISSION_BY_REQUEST_TYPE: Record<string, string> = {
    priceAdjustmentApproval: CustomPermission.RequestPriceAdjustmentApproval.Permission,
    discountGrantApproval: CustomPermission.RequestDiscountGrantApproval.Permission,
    creditTermApproval: CustomPermission.RequestCreditTermApproval.Permission,
};

@Resolver('ApprovalRequest')
export class ApprovalRequestResolver {
    constructor(
        private approvalRequestService: ApprovalRequestService,
        private approvalStepService: ApprovalStepService,
        private workflowDefinitionService: WorkflowDefinitionService,
        private readAccess: ApprovalReadAccessService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    @Query()
    @Allow(
        CustomPermission.ApproveDiscountRequest.Permission,
        CustomPermission.ApproveSecurityLimit.Permission,
        CustomPermission.RequestPriceAdjustmentApproval.Permission,
        CustomPermission.RequestDiscountGrantApproval.Permission,
        CustomPermission.RequestCreditTermApproval.Permission,
    )
    async approvalRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<ApprovalRequest | null> {
        return this.readAccess.visibleOrNull(
            ctx,
            await this.approvalStepService.findRequest(ctx, args.id),
        );
    }

    // Gated on Authenticated only: the service scopes results to the caller, so roles that never submit
    // requests get an empty summary instead of a ForbiddenError that would crash the shared dashboard.
    @Query()
    @Allow(Permission.Authenticated)
    async myApprovalRequestsSummary(
        @Ctx() ctx: RequestContext,
        @Args() args: { recentLimit?: number },
    ): Promise<{ pendingCount: number; recent: ApprovalRequest[] }> {
        return this.approvalRequestService.getMySummary(
            ctx,
            args.recentLimit ?? 5,
            await this.priceTypeAccess.allowedCodes(ctx),
        );
    }

    // Gated on ReadOrder, not an approval permission: any role that sees the order list needs the flag.
    // No department/branch scoping: callers only match these ids against their already-scoped orders.
    @Query()
    @Allow(Permission.ReadOrder)
    async pendingPriceAdjustmentOrderIds(@Ctx() ctx: RequestContext): Promise<string[]> {
        return this.approvalRequestService.findPendingPriceAdjustmentOrderIds(ctx);
    }

    // Order detail page (docs/ai/manager-portal-pages/03-order-detail.md, "Price adjustment
    // history") — same Permission.ReadOrder reasoning as above.
    @Query()
    @Allow(Permission.ReadOrder)
    async priceAdjustmentRequestsForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<ApprovalRequest[]> {
        return this.approvalRequestService.findPriceAdjustmentRequestsForOrder(ctx, args.orderId);
    }

    // Gated on ReadCatalog to match discountRules: discount policy is company-wide, not per-branch.
    @Query()
    @Allow(Permission.ReadCatalog)
    async approvalRequestsByType(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestType: string; options?: ApprovalListOptions },
    ): Promise<PaginatedList<ApprovalRequest>> {
        return this.approvalRequestService.findByRequestType(
            ctx,
            args.requestType,
            await this.readAccess.withGate(ctx, args.options),
        );
    }

    // Approvals inbox (docs/ai/manager-portal-pages/10-approvals-inbox.md) — one call for both
    // tabs, same aggregated-query rationale as myApprovalRequestsSummary/getMySummary.
    @Query()
    @Allow(Permission.Authenticated)
    async myApprovalsInbox(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { awaitingOptions?: ApprovalListOptions; allInvolvedOptions?: ApprovalListOptions },
    ): Promise<{
        awaitingMyDecision: PaginatedList<ApprovalRequest>;
        allInvolved: PaginatedList<ApprovalRequest>;
    }> {
        const [awaitingMyDecision, allInvolved] = await Promise.all([
            this.approvalRequestService.findAwaitingMyDecision(
                ctx,
                await this.readAccess.withGate(ctx, args.awaitingOptions),
            ),
            this.approvalRequestService.findAllInvolving(
                ctx,
                await this.readAccess.withGate(ctx, args.allInvolvedOptions),
            ),
        ]);
        return { awaitingMyDecision, allInvolved };
    }

    @ResolveField()
    async steps(
        @Ctx() ctx: RequestContext,
        @Parent() request: { id: ID },
    ): Promise<ApprovalStep[]> {
        return this.approvalStepService.findSteps(ctx, request.id);
    }

    // Null once no longer pending: currentStepIndex is meaningless after approved/rejected.
    @ResolveField()
    async currentStepRole(
        @Ctx() ctx: RequestContext,
        @Parent() request: { requestType: string; status: string; currentStepIndex: number },
    ): Promise<string | null> {
        if (request.status !== 'pending') {
            return null;
        }
        let definition: ParsedWorkflowDefinition;
        try {
            definition = await this.workflowDefinitionService.getDefinition(
                ctx,
                request.requestType,
            );
        } catch {
            return null;
        }
        return definition.steps[request.currentStepIndex]?.role ?? null;
    }

    // Covers future steps too: they have no ApprovalStep audit row, so steps/currentStepRole miss them.
    @ResolveField()
    async stepRoles(
        @Ctx() ctx: RequestContext,
        @Parent() request: { requestType: string },
    ): Promise<string[]> {
        try {
            const definition = await this.workflowDefinitionService.getDefinition(
                ctx,
                request.requestType,
            );
            return definition.steps.map(s => s.role);
        } catch {
            return [];
        }
    }

    // Total step count in this request's chain — combined with currentStepIndex client-side for
    // "Step 2 of 3" (see 10-approvals-inbox.md).
    @ResolveField()
    async totalSteps(
        @Ctx() ctx: RequestContext,
        @Parent() request: ApprovalRequest,
    ): Promise<number> {
        const { totalSteps } = await this.approvalRequestService.getCurrentStepDefinition(
            ctx,
            request,
        );
        return totalSteps;
    }

    // Escalation options must come only from this fixed list, never a free choice of administrator.
    @ResolveField()
    async escalatesTo(
        @Ctx() ctx: RequestContext,
        @Parent() request: ApprovalRequest,
    ): Promise<string[]> {
        if (request.status !== 'pending') return [];
        const { stepDef } = await this.approvalRequestService.getCurrentStepDefinition(
            ctx,
            request,
        );
        return stepDef?.escalatesTo ?? [];
    }

    @Transaction()
    @Mutation()
    async createApprovalRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestType: string; payload: string },
    ): Promise<ApprovalRequest> {
        const requiredPermission = CREATE_PERMISSION_BY_REQUEST_TYPE[args.requestType];
        if (!requiredPermission || !ctx.userHasPermissions([requiredPermission as never])) {
            throw new ForbiddenError();
        }
        return this.approvalRequestService.createRequest(
            ctx,
            args.requestType,
            JSON.parse(args.payload) as Record<string, unknown>,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(
        CustomPermission.ApproveDiscountRequest.Permission,
        CustomPermission.ApproveSecurityLimit.Permission,
    )
    async decideApprovalRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; decision: ApprovalStepDecision; comment?: string },
    ): Promise<ApprovalRequest> {
        await this.readAccess.assertVisible(ctx, args.requestId);
        return this.approvalRequestService.decide(ctx, args.requestId, args.decision, args.comment);
    }

    @Transaction()
    @Mutation()
    async escalateApprovalRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; escalateToAdministratorId: ID },
    ): Promise<ApprovalRequest> {
        await this.readAccess.assertVisible(ctx, args.requestId);
        return this.approvalRequestService.escalate(
            ctx,
            args.requestId,
            args.escalateToAdministratorId,
        );
    }
}

@Resolver('WorkflowDefinition')
export class WorkflowDefinitionResolver {
    constructor(private workflowDefinitionService: WorkflowDefinitionService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageApprovalWorkflows.Permission)
    async upsertWorkflowDefinition(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestType: string; displayName: string; steps: WorkflowStepDefinition[] },
    ): Promise<WorkflowDefinition> {
        return this.workflowDefinitionService.upsertDefinition(
            ctx,
            args.requestType,
            args.displayName,
            args.steps,
        );
    }
}
