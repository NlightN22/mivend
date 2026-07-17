import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentVisibilityService } from './payment-visibility.service';
import { PaymentListOptions } from './payment-attempt.service';

// Scoped equivalent of a plain "list all payments" query for the manager portal — see
// PaymentVisibilityService for the derived-from-Invoice scoping reasoning.
@Resolver()
export class AdminPaymentVisibilityResolver {
    constructor(private paymentVisibilityService: PaymentVisibilityService) {}

    @Query()
    @Allow(CustomPermission.ReadPayment.Permission)
    async visiblePayments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: PaymentListOptions; counterpartyId?: string },
    ): Promise<PaginatedList<PaymentAttempt>> {
        return this.paymentVisibilityService.findVisible(ctx, args.options, args.counterpartyId);
    }
}
