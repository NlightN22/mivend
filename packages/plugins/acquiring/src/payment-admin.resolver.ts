import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, TransactionalConnection } from '@vendure/core';

import { Dispute, DisputeStatus, DisputeType } from './entities/dispute.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentRefund, PaymentRefundStatus } from './entities/payment-refund.entity';
import { DisputeService } from './dispute.service';
import { PaymentRefundService } from './payment-refund.service';

// Ops/seed-only surface: lets `infrastructure/scripts/seed-payment-refunds.mjs` attach
// realistic-looking refund/dispute rows to existing captured online-acquiring payments, the
// same way `seed-approvals.mjs` creates ApprovalRequest rows through real Admin mutations
// instead of a database bypass (AGENTS.md "Dev seed rules" exception clause — refunds/disputes
// are payment-provider-reported workflow state, not ERP master data).
@Resolver()
export class PaymentAdminResolver {
    constructor(
        private connection: TransactionalConnection,
        private paymentRefundService: PaymentRefundService,
        private disputeService: DisputeService,
    ) {}

    @Query()
    @Allow(Permission.SuperAdmin)
    async capturedOnlinePayments(
        @Ctx() ctx: RequestContext,
        @Args() args: { take?: number },
    ): Promise<PaymentAttempt[]> {
        return this.connection.getRepository(ctx, PaymentAttempt).find({
            where: { channel: 'online-acquiring', paymentStatus: 'captured' },
            order: { createdAt: 'DESC' },
            take: args.take ?? 20,
        });
    }

    // Seed-script idempotency helper only — see seed-payment-refunds.mjs's rerun-without-
    // duplicating check. providerRefundId is the natural dedup key for a refund (real incident:
    // reruns of the seed script previously duplicated every refund/dispute row because nothing
    // checked for a prior run).
    @Query()
    @Allow(Permission.SuperAdmin)
    async paymentRefundExists(
        @Ctx() ctx: RequestContext,
        @Args() args: { providerRefundId: string },
    ): Promise<boolean> {
        const found = await this.connection
            .getRepository(ctx, PaymentRefund)
            .findOne({ where: { providerRefundId: args.providerRefundId } });
        return !!found;
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async paymentDisputeExists(
        @Ctx() ctx: RequestContext,
        @Args() args: { paymentId: string; type: string },
    ): Promise<boolean> {
        const found = await this.connection.getRepository(ctx, Dispute).findOne({
            where: { paymentId: Number(args.paymentId), type: args.type as DisputeType },
        });
        return !!found;
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async recordPaymentRefund(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            paymentId: string;
            amount: number;
            reason: string;
            providerRefundId?: string;
            status?: PaymentRefundStatus;
        },
    ): Promise<PaymentRefund> {
        return this.paymentRefundService.create(ctx, {
            paymentId: Number(args.paymentId),
            amount: args.amount,
            reason: args.reason,
            providerRefundId: args.providerRefundId,
            status: args.status,
        });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async recordPaymentDispute(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { paymentId: string; type: DisputeType; amount: number; status?: DisputeStatus },
    ): Promise<Dispute> {
        return this.disputeService.create(ctx, {
            paymentId: Number(args.paymentId),
            type: args.type,
            amount: args.amount,
            status: args.status,
        });
    }
}
