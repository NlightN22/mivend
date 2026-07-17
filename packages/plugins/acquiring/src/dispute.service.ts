import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Dispute, DisputeStatus, DisputeType } from './entities/dispute.entity';

// A chargeback/dispute is its own entity with its own lifecycle, never folded into
// PaymentAttempt.paymentStatus (AGENTS.md sync rule #11). Only online-acquiring realistically
// produces one today (card-network chargebacks) — see docs/payments.md's refund-feasibility note.
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
