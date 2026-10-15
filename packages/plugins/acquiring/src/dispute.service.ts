import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Dispute, DisputeStatus, DisputeType } from './entities/dispute.entity';

// Chargeback has its own lifecycle; never fold it into PaymentAttempt.paymentStatus.
// Only online acquiring produces them today (card-network chargebacks); see docs/payments.md.
@Injectable()
export class DisputeService {
    constructor(private connection: TransactionalConnection) {}

    async findByPaymentId(ctx: RequestContext, paymentId: number): Promise<Dispute[]> {
        return this.connection.getRepository(ctx, Dispute).find({
            where: { paymentId },
            order: { openedAt: 'DESC' },
        });
    }

    async create(
        ctx: RequestContext,
        input: {
            paymentId: number;
            type: DisputeType;
            amount: number;
            status?: DisputeStatus;
            openedAt?: Date;
        },
    ): Promise<Dispute> {
        const repo = this.connection.getRepository(ctx, Dispute);
        return repo.save(
            repo.create({
                paymentId: input.paymentId,
                type: input.type,
                amount: input.amount,
                status: input.status ?? 'opened',
                openedAt: input.openedAt ?? new Date(),
            }),
        );
    }
}
