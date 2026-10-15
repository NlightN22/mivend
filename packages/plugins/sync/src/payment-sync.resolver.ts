import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { OrderSyncService } from './order-sync.service';

// Orders owned by another instance get the payment reported onward, never mutated here.
// Placeholder until kassa hardware exists; see OrderSyncService.recordWitnessedPayment.
@Resolver()
export class PaymentSyncResolver {
    constructor(private readonly orderSyncService: OrderSyncService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async recordWitnessedPayment(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            orderId: string;
            method: string;
            amount: number;
            proformaInvoiceId?: number;
            organizationId?: number;
            outcome?: 'success' | 'pending' | 'fail' | 'cancel';
            rrn?: string;
        },
    ): Promise<boolean> {
        await this.orderSyncService.recordWitnessedPayment(
            ctx,
            args.orderId,
            args.method,
            args.amount,
            args.proformaInvoiceId,
            args.organizationId,
            args.outcome,
            args.rrn,
        );
        return true;
    }
}
