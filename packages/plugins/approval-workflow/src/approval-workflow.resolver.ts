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
import { CustomPermission } from '@mivend/plugin-access-control';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { ApprovalRequestService } from './approval-request.service';
import { WorkflowDefinitionService, ParsedWorkflowDefinition } from './workflow-definition.service';
import { ApprovalListOptions, ApprovalStepDecision, WorkflowStepDefinition } from './types';
import { ApprovalStepService } from './approval-step.service';

// A requestType is an internal technical identifier fixed by the workflow engine, not
// swappable business data — mapping it to the permission required to *create* that kind of
// request is therefore code, not a DB table, per AGENTS.md's "internal technical states"
// carve-out. The chain of *who approves* each step, by contrast, is fully data-driven
// (WorkflowDefinition.stepsJson).
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
        return this.approvalStepService.findRequest(ctx, args.id);
    }

    // Manager portal dashboard — see docs/ai/manager-portal-pages/01-dashboard.md, "My approval
    // requests status" — one aggregated call instead of a count query plus a list query.
    // Gated on Authenticated only (like `departments`): the result is inherently scoped to
    // `requestedByAdministratorId = caller` inside the service, so a role that never submits
    // approval requests (e.g. Operator) safely gets back an empty summary rather than a
    // ForbiddenError that would crash the shared dashboard page for that role.
    @Query()
    @Allow(Permission.Authenticated)
    async myApprovalRequestsSummary(
        @Ctx() ctx: RequestContext,
        @Args() args: { recentLimit?: number },
    ): Promise<{ pendingCount: number; recent: ApprovalRequest[] }> {
        return this.approvalRequestService.getMySummary(ctx, args.recentLimit ?? 5);
    }

    // Manager portal orders list — see docs/ai/manager-portal-pages/02-orders-list.md,
    // "waiting approval" flag. Gated on Permission.ReadOrder (same as `visibleOrders`) rather
    // than an approval-specific permission: any role that can see the order list needs this to
    // flag orders in it, not just roles that can create/approve requests. No department/branch
    // scoping here — the caller only ever cross-references these ids against their own
    // already-scoped `visibleOrders` result.
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

    // Manager portal /discounts (docs/ai/manager-portal-pages/09-discounts.md) — gated on
    // ReadCatalog, same visibility as `discountRules` (company-wide policy, not scoped by
    // department/branch).
    @Query()
    @Allow(Permission.ReadCatalog)
    async approvalRequestsByType(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestType: string; options?: ApprovalListOptions },
    ): Promise<PaginatedList<ApprovalRequest>> {
        return this.approvalRequestService.findByRequestType(
            ctx,
            args.requestType,
            args.options ?? {},
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
            this.approvalRequestService.findAwaitingMyDecision(ctx, args.awaitingOptions ?? {}),
            this.approvalRequestService.findAllInvolving(ctx, args.allInvolvedOptions ?? {}),
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

    // Human-readable label for the role the request is currently waiting on, e.g. "Purchasing
    // Dept Head" — null once the request is no longer pending (currentStepIndex is meaningless
    // after approved/rejected).
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

    // Role label for every step in this request's chain, in order — the approval detail page's
    // ApprovalStepper (see 11-approval-detail.md) needs to render future/not-yet-reached steps
    // too, which have no ApprovalStep audit row yet and so aren't covered by `steps` or
    // `currentStepRole` (current-step-only).
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

    // The current step's escalatesTo role list — powers the "Escalate to..." select on
    // 11-approval-detail.md, which must only offer roles from this fixed list, never a free
    // choice of administrator.
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
        return this.approvalRequestService.decide(ctx, args.requestId, args.decision, args.comment);
    }

    @Transaction()
    @Mutation()
    async escalateApprovalRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; escalateToAdministratorId: ID },
    ): Promise<ApprovalRequest> {
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
