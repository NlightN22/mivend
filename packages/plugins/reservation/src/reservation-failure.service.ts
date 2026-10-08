import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Order,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';

import {
    describeReservationFailure,
    isExpectedReservationError,
    REASON_LABEL,
    variantIdsOf,
} from './reservation-failure';
import type { ReservationFailure } from './reservation-failure';

// Staff-visible reason for a failed automatic reserve (#199). Cleared by ReservationService when
// any reserve succeeds (setOrderReservationState -> RESERVED).
@Injectable()
export class ReservationFailureService {
    constructor(private connection: TransactionalConnection) {}

    // A partial customFields update: only these three columns are written, never the whole entity
    // (docs/concurrency.md; an unhydrated Order must not go through save()).
    async describe(ctx: RequestContext, error: unknown): Promise<ReservationFailure> {
        const ids = variantIdsOf(error);
        const variants = ids.length
            ? await this.connection
                  .getRepository(ctx, ProductVariant)
                  .find({ where: { id: In(ids) }, select: ['id', 'sku'] })
            : [];
        return describeReservationFailure(error, new Map(variants.map(v => [String(v.id), v.sku])));
    }

    // The manual confirm shows the same reason and lines the order page shows for an automatic
    // failure; anything that is not an expected domain error is rethrown untouched.
    async toStaffError(ctx: RequestContext, error: unknown): Promise<Error> {
        if (!isExpectedReservationError(error)) return error as Error;
        const failure = await this.describe(ctx, error);
        return new UserInputError(`${REASON_LABEL[failure.reason]}: ${failure.detail}`);
    }

    async record(ctx: RequestContext, orderId: ID, error: unknown): Promise<void> {
        const failure = await this.describe(ctx, error);
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
