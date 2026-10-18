import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentVisibilityService } from './payment-visibility.service';
import { PaymentAttemptQueryService, PaymentListOptions } from './payment-attempt-query.service';

export interface OrderPaymentSummary {
    orderId: string;
    capturedAmount: number;
}

// Scoped equivalent of a plain "list all payments" query for the manager portal — see
// PaymentVisibilityService for the derived-from-ProformaInvoice scoping reasoning.
@Resolver()
export class AdminPaymentVisibilityResolver {
    constructor(
        private paymentVisibilityService: PaymentVisibilityService,
        private paymentAttemptQueryService: PaymentAttemptQueryService,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadPayment.Permission)
    async visiblePayments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: PaymentListOptions; counterpartyId?: string },
    ): Promise<PaginatedList<PaymentAttempt>> {
        return this.paymentVisibilityService.findVisible(ctx, args.options, args.counterpartyId);
    }

    // Refunds and disputes are deliberately not netted out of the captured amount.
    // See PaymentAttemptService.sumCapturedAmountsByOrderIds for the definition of "captured".
    @Query()
    @Allow(CustomPermission.ReadPayment.Permission)
    async orderPaymentSummaries(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderIds: string[] },
    ): Promise<OrderPaymentSummary[]> {
        const numericIds = args.orderIds.map(Number);
        const sums = await this.paymentAttemptQueryService.sumCapturedAmountsByOrderIds(
            ctx,
            numericIds,
        );
        return args.orderIds.map(orderId => ({
            orderId,
            capturedAmount: sums.get(Number(orderId)) ?? 0,
        }));
    }
}
