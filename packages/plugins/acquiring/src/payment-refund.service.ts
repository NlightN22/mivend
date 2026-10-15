import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { NumberingService } from '@mivend/plugin-numbering';

import { PaymentRefund, PaymentRefundStatus } from './entities/payment-refund.entity';

// Refund is a separate operation (OpKey -> providerRefundId, own status), not a negative attempt.
// Only online acquiring can produce refunds today; see docs/payments.md (refund feasibility).
@Injectable()
export class PaymentRefundService {
    constructor(
        private connection: TransactionalConnection,
        private numberingService: NumberingService,
    ) {}

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
                number: await this.numberingService.next(ctx, 'refund'),
                paymentId: input.paymentId,
                amount: input.amount,
                reason: input.reason,
                status: input.status ?? 'succeeded',
                providerRefundId: input.providerRefundId ?? null,
            }),
        );
    }
}
