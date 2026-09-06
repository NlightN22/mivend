import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { PaymentReconciliationIssue } from './entities/payment-reconciliation-issue.entity';
import {
    OpenPaymentReconciliationIssueListOptions,
    PaymentReconciliationIssueService,
} from './payment-reconciliation-issue.service';

@Resolver()
export class PaymentReconciliationIssueResolver {
    constructor(private paymentReconciliationIssueService: PaymentReconciliationIssueService) {}

    @Query()
    @Allow(CustomPermission.ReadPayment.Permission)
    async openPaymentReconciliationIssues(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenPaymentReconciliationIssueListOptions },
    ): Promise<PaginatedList<PaymentReconciliationIssue>> {
        return this.paymentReconciliationIssueService.findOpen(ctx, args.options);
    }
}
