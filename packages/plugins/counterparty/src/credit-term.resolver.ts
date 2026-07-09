import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import { CreditTermService, CreditTermRequestInput } from './credit-term.service';

@Resolver()
export class CreditTermResolver {
    constructor(private creditTermService: CreditTermService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.RequestCreditTermApproval.Permission)
    async requestCreditTermExtension(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CreditTermRequestInput },
    ): Promise<ApprovalRequest> {
        return this.creditTermService.requestExtension(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(
        CustomPermission.ApproveDiscountRequest.Permission,
        CustomPermission.ApproveSecurityLimit.Permission,
    )
    async decideCreditTermRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; decision: ApprovalStepDecision; comment?: string },
    ): Promise<ApprovalRequest> {
        return this.creditTermService.decideAndApply(
            ctx,
            args.requestId,
            args.decision,
            args.comment,
        );
    }
}
