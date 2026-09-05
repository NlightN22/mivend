import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';

// Reports a detected reservation/1C quantity drift for a human to resolve — kept intentionally
// minimal (report only), same as plugin-acquiring's PaymentReconciliationIssueService.
// Resolution/triage tooling is future scope, not part of detecting the issue.
@Injectable()
export class ReservationReconciliationIssueService {
    constructor(private connection: TransactionalConnection) {}

    async report(
        ctx: RequestContext,
        details: {
            orderId: string;
            productVariantId: string;
            localQuantity: number;
            erpQuantity: number;
            orderEntityId: string;
        },
    ): Promise<ReservationReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, ReservationReconciliationIssue);
        return repo.save(
            repo.create({
                issueType: 'QUANTITY_MISMATCH',
                orderId: details.orderId,
                productVariantId: details.productVariantId,
                localQuantity: details.localQuantity,
                erpQuantity: details.erpQuantity,
                orderEntityId: details.orderEntityId,
                detectedAt: new Date(),
                status: 'open',
                resolution: null,
            }),
        );
    }
}
