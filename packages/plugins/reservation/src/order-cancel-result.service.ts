import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { withOrderCancelLocks, ctxQuery } from 'shared';

import { OrderCancellationService } from './order-cancellation.service';
import { UnknownOrderUuidError } from './reservation-errors';

export interface OrderCancelResultInput {
    orderUuid: string;
    status: 'cancelled' | 'rejected';
    rejectionReasonCode: string | null;
    rejectionReasonText: string | null;
}

export type OrderCancelResultOutcome =
    | 'cancelled'
    | 'already-cancelled'
    | 'refusal-recorded'
    | 'refusal-after-local-cancel'
    | 'refusal-repeated'
    | 'refusal-without-request';

// Applies the ERP's answer to a cancel request (order-cancel-result stream) under the same lock as
// the request itself, so a late answer and a concurrent confirm/cancel serialize per order.
@Injectable()
export class OrderCancelResultService {
    constructor(
        private connection: TransactionalConnection,
        private cancellation: OrderCancellationService,
    ) {}

    async apply(
        ctx: RequestContext,
        input: OrderCancelResultInput,
    ): Promise<OrderCancelResultOutcome> {
        const orderId = await this.findOrderIdByUuid(ctx, input.orderUuid);
        if (!orderId) {
            throw new UnknownOrderUuidError(
                `order-cancel-result: no Order found via orderUuid=${input.orderUuid}`,
            );
        }
        return withOrderCancelLocks(this.connection, ctx, orderId, async txCtx => {
            const repo = this.connection.getRepository(txCtx, Order);
            const order = await repo.findOne({ where: { id: orderId } });
            if (!order) {
                throw new UnknownOrderUuidError(
                    `order-cancel-result: Order ${orderId} vanished (orderUuid=${input.orderUuid})`,
                );
            }
            return input.status === 'cancelled'
                ? this.applyCancelled(txCtx, order)
                : this.applyRejected(txCtx, order, input);
        });
    }

    private async applyCancelled(
        ctx: RequestContext,
        order: Order,
    ): Promise<OrderCancelResultOutcome> {
        await this.connection
            .getRepository(ctx, Order)
            .update(order.id, { customFields: { cancelRequestStatus: 'CANCELLED' } });
        if (order.state === 'Cancelled') return 'already-cancelled';
        // The ERP is the authority on its own order: it cancelled, so the local order follows.
        await this.cancellation.cancelLocally(
            ctx,
            order,
            order.customFields.cancelReason ?? 'cancelled by the ERP',
        );
        return 'cancelled';
    }

    private async applyRejected(
        ctx: RequestContext,
        order: Order,
        input: OrderCancelResultInput,
    ): Promise<OrderCancelResultOutcome> {
        const { cancelRequestStatus: status, cancelRefusalReason: previousDetail } =
            order.customFields;
        if (status === 'REFUSED') return 'refusal-repeated';
        if (status !== 'REQUESTED') return 'refusal-without-request';

        const detail =
            `${input.rejectionReasonCode ?? ''} ${input.rejectionReasonText ?? ''}`.trim();
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: { cancelRequestStatus: 'REFUSED', cancelRefusalReason: detail },
        });
        const cancelledLocally = order.state === 'Cancelled';
        const sameRefusalAgain = previousDetail != null && previousDetail === detail;
        if (!sameRefusalAgain) {
            await this.cancellation.notify(
                ctx,
                order,
                'error',
                cancelledLocally
                    ? 'ERP refused cancel of a locally cancelled order'
                    : 'ERP refused order cancel',
                `Order ${order.code}: ${detail || 'no reason given'}.`,
            );
        }
        return cancelledLocally ? 'refusal-after-local-cancel' : 'refusal-recorded';
    }

    // Raw SQL: Order.customFields.uuid is declared by another plugin's augmentation, same reason as
    // ReservationWriteOffSyncService.findOrderIdByUuid.
    private async findOrderIdByUuid(
        ctx: RequestContext,
        orderUuid: string,
    ): Promise<string | null> {
        const result = await ctxQuery<Array<{ id: string | number | null }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE "customFieldsUuid" = $1 LIMIT 1`,
            [orderUuid],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }
}
