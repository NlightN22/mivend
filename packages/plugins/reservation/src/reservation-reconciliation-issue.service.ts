import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';

// Reports a detected reservation/1C drift for a human to resolve — kept intentionally minimal
// (report only), same as plugin-acquiring's PaymentReconciliationIssueService.
// Resolution/triage tooling is future scope, not part of detecting the issue.
@Injectable()
export class ReservationReconciliationIssueService {
    constructor(private connection: TransactionalConnection) {}

    async reportQuantityMismatch(
        ctx: RequestContext,
        details: {
            orderId: string;
            productVariantId: string;
            localQuantity: number;
            erpQuantity: number;
            orderEntityId: string;
        },
    ): Promise<ReservationReconciliationIssue> {
        return this.save(ctx, {
            issueType: 'QUANTITY_MISMATCH',
            orderId: details.orderId,
            productVariantId: details.productVariantId,
            localQuantity: details.localQuantity,
            erpQuantity: details.erpQuantity,
            externalProductId: null,
            orderEntityId: details.orderEntityId,
        });
    }

    // mivend.audit.72's HIGH finding: an unresolvable productId->ProductVariant mapping used to
    // be silently indistinguishable from "1C hasn't confirmed this line yet" and blocked release
    // forever with no escalation. Reported as its own issue type instead.
    async reportUnresolvedProductMapping(
        ctx: RequestContext,
        details: {
            orderId: string;
            externalProductId: string;
            orderEntityId: string;
        },
    ): Promise<ReservationReconciliationIssue> {
        return this.save(ctx, {
            issueType: 'UNRESOLVED_PRODUCT_MAPPING',
            orderId: details.orderId,
            productVariantId: null,
            localQuantity: null,
            erpQuantity: null,
            externalProductId: details.externalProductId,
            orderEntityId: details.orderEntityId,
        });
    }

    private async save(
        ctx: RequestContext,
        fields: Pick<
            ReservationReconciliationIssue,
            | 'issueType'
            | 'orderId'
            | 'productVariantId'
            | 'localQuantity'
            | 'erpQuantity'
            | 'externalProductId'
            | 'orderEntityId'
        >,
    ): Promise<ReservationReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, ReservationReconciliationIssue);
        return repo.save(
            repo.create({
                ...fields,
                detectedAt: new Date(),
                status: 'open',
                resolution: null,
            }),
        );
    }
}
