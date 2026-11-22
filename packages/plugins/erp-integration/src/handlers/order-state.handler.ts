import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ExternalOrderService, OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import {
    ReservationOrderStateSyncService,
    UnknownOrderUuidError,
} from '@mivend/plugin-reservation';

import { MissingDependencyError } from '../types';
import { orderStateFacts, paidAmountMinor } from './external-order-input';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { OrderLineResolver } from './order-line-resolver';
import { parseTimestamp } from './settlement-payload';

// Applies erp.order-state.events.v1: the values derived from an order's linked documents and register sets.
// A value the event leaves out was not computed and never clears a stored one.
@Injectable()
export class OrderStateStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly reservationOrderState: ReservationOrderStateSyncService,
        private readonly externalOrderService: ExternalOrderService,
        private readonly lineResolver: OrderLineResolver,
        private readonly statusReference: OrderStatusReferenceService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        if (payload.isDeleted === true) {
            return inboundNoop(`order-state ${entityId}: deleted, skipping`);
        }
        const derivedStatus = await this.resolveStatusCode(ctx, entityId, payload.statusCode);
        const derivedStatusAt =
            parseTimestamp(payload.updatedAt) ?? parseTimestamp(payload.occurredAt);
        const stored = await this.externalOrderService.findByErpOrderId(ctx, entityId);
        if (!stored) {
            throw new UnknownOrderUuidError(`order-state ${entityId}: order not stored here yet`);
        }

        if (stored.isExternal) {
            await this.externalOrderService.applyDerived(ctx, entityId, {
                erpStatus: derivedStatus,
                erpStatusAt: derivedStatusAt,
                paidAmountMinor: paidAmountMinor(payload),
                erpFacts: orderStateFacts(payload),
            });
            return inboundApplied();
        }

        const resolved = await this.lineResolver.resolve(
            ctx,
            'order-state',
            entityId,
            payload.lines,
            false,
        );
        const computed = resolved.lines.filter(line => line.raw.reservedQuantity !== undefined);
        await this.reservationOrderState.handleOrderState(ctx, {
            orderEntityId: entityId,
            reservedLines: computed.map(line => ({
                productVariantId: line.productVariantId,
                reservedQuantity: Math.round(Number(line.raw.reservedQuantity) * line.ratioToBase),
            })),
            // A line without a computed reserve must not make the stored set look complete.
            linesDiscarded:
                resolved.withoutProductId > 0 || computed.length < resolved.lines.length,
            derivedStatus,
            derivedStatusAt,
            paidAmountMinor: paidAmountMinor(payload),
            erpFacts: orderStateFacts(payload),
        });
        return resolved.withoutProductId > 0
            ? inboundNoop(
                  `order-state ${entityId}: applied without ${resolved.withoutProductId} line(s) lacking a productId`,
              )
            : inboundApplied();
    }

    // Absent means nothing derived; a code missing from the dictionary retries (bounded by the inbox policy).
    private async resolveStatusCode(
        ctx: RequestContext,
        entityId: string,
        statusCode: unknown,
    ): Promise<string | null> {
        if (typeof statusCode !== 'string' || statusCode === '') return null;
        if (!(await this.statusReference.dictionary(ctx)).get(statusCode)) {
            throw new MissingDependencyError(
                `order-state ${entityId}: status ${statusCode} is not in the order status dictionary yet`,
            );
        }
        return statusCode;
    }
}
