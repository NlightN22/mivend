import { Args, Query, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import {
    DiscountGrantService,
    DiscountGrantInput,
    DiscountGrantForCustomer,
} from './discount-grant.service';
import { DiscountGrant } from './discount-grant.entity';

@Resolver()
export class DiscountGrantResolver {
    constructor(private discountGrantService: DiscountGrantService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async expiringDiscountGrants(
        @Ctx() ctx: RequestContext,
        @Args() args: { withinDays: number },
    ): Promise<DiscountGrant[]> {
        return this.discountGrantService.findExpiringSoon(ctx, args.withinDays);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async discountGrants(@Ctx() ctx: RequestContext): Promise<DiscountGrant[]> {
        return this.discountGrantService.findAll(ctx);
    }

    // Real fix for /discounts (issue #39) — see DiscountGrantService.findForRuleIds.
    @Query()
    @Allow(Permission.ReadCatalog)
    async discountGrantsForRuleIds(
        @Ctx() ctx: RequestContext,
        @Args() args: { ruleIds: ID[] },
    ): Promise<DiscountGrant[]> {
        return this.discountGrantService.findForRuleIds(ctx, args.ruleIds);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async discountGrantsForCounterparty(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID },
    ): Promise<DiscountGrantForCustomer[]> {
        return this.discountGrantService.findForCounterparty(ctx, args.counterpartyId);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.RequestDiscountGrantApproval.Permission)
    async requestDiscountGrant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: DiscountGrantInput },
    ): Promise<ApprovalRequest> {
        return this.discountGrantService.requestGrant(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ApproveDiscountRequest.Permission)
    async decideDiscountGrantRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; decision: ApprovalStepDecision; comment?: string },
    ): Promise<ApprovalRequest> {
        return this.discountGrantService.decideAndApply(
            ctx,
            args.requestId,
            args.decision,
            args.comment,
        );
    }
}
