import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import { DiscountGrantService, DiscountGrantInput } from './discount-grant.service';

@Resolver()
export class DiscountGrantResolver {
    constructor(private discountGrantService: DiscountGrantService) {}

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
