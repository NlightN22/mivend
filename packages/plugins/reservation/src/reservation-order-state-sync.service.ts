import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import { withOrderCancelLocks } from 'shared';

import { ErpOrderReserveService } from './erp-order-reserve.service';
import { OrderErpStatusService } from './order-erp-status.service';
import { UnknownOrderUuidError } from './reservation-errors';
import { ReservationWriteOffSyncService } from './reservation-write-off-sync.service';
import type { OrderStateInput } from './reservation-write-off-sync.types';

// Applies erp.order-state.events.v1 to a mivend order: reserve hand-over, derived status, paid amount, accounting facts.
@Injectable()
export class ReservationOrderStateSyncService {
    constructor(
        private connection: TransactionalConnection,
        private writeOff: ReservationWriteOffSyncService,
        private orderErpStatus: OrderErpStatusService,
        private statuses: OrderStatusReferenceService,
        private erpReserve: ErpOrderReserveService,
    ) {}

    async handleOrderState(ctx: RequestContext, input: OrderStateInput): Promise<void> {
        const orderId = await this.writeOff.findOrderIdByErpId(ctx, input.orderEntityId);
        if (!orderId) {
            // Retryable like order-changed (#211): the order may not be registered here yet.
            throw new UnknownOrderUuidError(
                `order-state: no Order found via orderEntityId=${input.orderEntityId}`,
            );
        }
        // The cancel locks: a cancelled derived status cancels the order inside this transaction.
        await withOrderCancelLocks(this.connection, ctx, orderId, txCtx =>
            this.apply(txCtx, orderId, input),
        );
    }

    private async apply(
        ctx: RequestContext,
        orderId: string,
        input: OrderStateInput,
    ): Promise<void> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        if (!order) throw new UnknownOrderUuidError(`order-state: Order ${orderId} not found`);

        const customFields: Partial<typeof order.customFields> = { ...input.erpFacts };
        if (input.paidAmountMinor != null) customFields.erpPaidAmount = input.paidAmountMinor;
        if (Object.keys(customFields).length > 0) {
            await this.connection.getRepository(ctx, Order).update(order.id, { customFields });
            order.customFields = { ...order.customFields, ...customFields };
        }

        await this.orderErpStatus.apply(
            ctx,
            order,
            input.derivedStatus,
            input.derivedStatusAt ?? null,
        );
        await this.erpReserve.record(
            ctx,
            orderId,
            input.reservedLines,
            order.customFields.erpReserveUntil ?? null,
            !input.linesDiscarded,
        );
        await this.writeOff.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId,
            'order-state',
            (await this.statuses.dictionary(ctx)).has(input.derivedStatus, 'warehouseStarted'),
        );
    }
}
