import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { OrderSyncService } from './order-sync.service';

// Placeholder entry point for a branch till/kassa integration (no real hardware yet) — an
// operator (or, once built, an automated kassa client) reports a payment they witnessed. See
// OrderSyncService.recordWitnessedPayment for what happens next: applied for real if this
// instance owns the order, reported onward as a fact otherwise — never a direct mutation of
// another instance's order. See docs/architecture.md's "Order as a read-model" section.
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
            invoiceId?: number;
            outcome?: 'success' | 'pending' | 'fail' | 'cancel';
            rrn?: string;
        },
    ): Promise<boolean> {
        await this.orderSyncService.recordWitnessedPayment(
            ctx,
            args.orderId,
            args.method,
            args.amount,
            args.invoiceId,
            args.outcome,
            args.rrn,
        );
        return true;
    }
}
