import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { describeReservationFailure, variantIdsOf } from './reservation-failure';

// Staff-visible reason for a failed automatic reserve (#199). Cleared by ReservationService when
// any reserve succeeds (setOrderReservationState -> RESERVED).
@Injectable()
export class ReservationFailureService {
    constructor(private connection: TransactionalConnection) {}

    // A partial customFields update: only these three columns are written, never the whole entity
    // (docs/concurrency.md; an unhydrated Order must not go through save()).
    async record(ctx: RequestContext, orderId: ID, error: unknown): Promise<void> {
        const ids = variantIdsOf(error);
        const variants = ids.length
            ? await this.connection
                  .getRepository(ctx, ProductVariant)
                  .find({ where: { id: In(ids) }, select: ['id', 'sku'] })
            : [];
        const failure = describeReservationFailure(
            error,
            new Map(variants.map(v => [String(v.id), v.sku])),
        );
        const customFields = {
            reservationFailureReason: failure.reason,
            reservationFailureDetail: failure.detail,
            reservationFailedAt: new Date(),
        };
        const repo = this.connection.getRepository(ctx, Order);
        await repo.update(orderId, { customFields });
        // The placement/payment event's own trailing save can revert the write (same hazard as
        // ReservationService.setOrderReservationState): verify it stuck, bounded retries.
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const current = await repo.findOne({ where: { id: orderId } });
            if (current?.customFields?.reservationFailureReason === failure.reason) return;
            await repo.update(orderId, { customFields });
        }
    }
}
