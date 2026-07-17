import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { PaymentRefund, PaymentRefundStatus } from './entities/payment-refund.entity';

// Modeled on Robokassa's refund API (docs.robokassa.ru/partner-api/MethodDescription/RefundOperation):
// a refund is its own operation with its own id (OpKey -> providerRefundId) and its own status,
// never a negative PaymentAttempt row (AGENTS.md sync rule #11). Only online-acquiring can
// realistically produce one today — see docs/payments.md's refund-feasibility note.
@Injectable()
export class PaymentRefundService {
    constructor(private connection: TransactionalConnection) {}

    async findByPaymentId(ctx: RequestContext, paymentId: number): Promise<PaymentRefund[]> {
        return this.connection.getRepository(ctx, PaymentRefund).find({
            where: { paymentId },
            order: { createdAt: 'DESC' },
        });
    }

    async create(
        ctx: RequestContext,
        input: {
            paymentId: number;
            amount: number;
            reason: string;
            status?: PaymentRefundStatus;
            providerRefundId?: string | null;
        },
    ): Promise<PaymentRefund> {
        const repo = this.connection.getRepository(ctx, PaymentRefund);
        return repo.save(
            repo.create({
                paymentId: input.paymentId,
                amount: input.amount,
                reason: input.reason,
                status: input.status ?? 'succeeded',
                providerRefundId: input.providerRefundId ?? null,
            }),
        );
    }
}
