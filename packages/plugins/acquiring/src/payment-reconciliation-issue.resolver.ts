import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, Permission, RequestContext } from '@vendure/core';

import { PaymentReconciliationIssue } from './entities/payment-reconciliation-issue.entity';
import {
    OpenPaymentReconciliationIssueListOptions,
    PaymentReconciliationIssueService,
} from './payment-reconciliation-issue.service';

@Resolver()
export class PaymentReconciliationIssueResolver {
    constructor(private paymentReconciliationIssueService: PaymentReconciliationIssueService) {}

    @Query()
    @Allow(Permission.ReadPayment)
    async openPaymentReconciliationIssues(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OpenPaymentReconciliationIssueListOptions },
    ): Promise<PaginatedList<PaymentReconciliationIssue>> {
        return this.paymentReconciliationIssueService.findOpen(ctx, args.options);
    }
}
