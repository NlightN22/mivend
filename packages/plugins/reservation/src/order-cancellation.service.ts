import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    Order,
    OrderService,
    Payment,
    PaymentService,
    RequestContext,
    TransactionalConnection,
    isGraphQlErrorResult,
} from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import { NotificationService } from '@mivend/plugin-notification';
import { withAggregateLock } from 'shared';

import { decideCancellation } from './order-cancellation.decision';
import type { CancelDecision, CancelRefusal } from './order-cancellation.decision';
import { OrderCancellationPortRegistry } from './order-cancellation.port';
import { OrderNotEligibleError } from './reservation-errors';
import { ReservationService } from './reservation.service';

export type CancelReason = 'reserve-expired' | 'customer-request' | 'staff-request';

export type CancelOutcome =
    | { kind: 'cancelled'; eventSent: boolean }
    | { kind: 'cancel-requested' }
    | { kind: 'already-cancelled' }
    | { kind: 'already-requested' }
    | { kind: 'left-to-erp' }
    | { kind: 'not-cancellable'; reason: CancelRefusal };

export interface CancelOptions {
    // false at the reserve deadline: a registered order is left to the ERP's own release job.
    requestRegistered?: boolean;
}

// Every cancel path goes through here (docs/order-contracts.md, "Reserve and order cancellation"),
// under reserveOrder's lock so a cancel, a confirm and a registration result serialize per order.
@Injectable()
export class OrderCancellationService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private paymentService: PaymentService,
        private reservationService: ReservationService,
        private notificationService: NotificationService,
        private eventBus: EventBus,
        private portRegistry: OrderCancellationPortRegistry,
    ) {}

    async cancel(
        ctx: RequestContext,
        orderId: ID,
        reason: CancelReason,
        options: CancelOptions = {},
    ): Promise<CancelOutcome> {
        return withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            const order = await this.connection
                .getRepository(txCtx, Order)
                .findOne({ where: { id: orderId } });
            if (!order) throw new OrderNotEligibleError('Order not found');

            const decision = await this.decide(txCtx, order, options.requestRegistered ?? true);
            return this.perform(txCtx, order, reason, decision);
        });
    }

    // Local cancel: release reservations, void the authorized payment, Vendure Cancelled, history
    // reason, staff notification. Callers hold the order's `reserve-order:<id>` lock.
    async cancelLocally(ctx: RequestContext, order: Order, reason: string): Promise<void> {
        await this.reservationService.releaseReservations(ctx, order.id);

        const payments = await this.connection
            .getRepository(ctx, Payment)
            .find({ where: { order: { id: order.id } } });
        for (const payment of payments.filter(p => p.state === 'Authorized')) {
            await this.paymentService.cancelPayment(ctx, payment.id);
        }

        const result = await this.orderService.cancelOrder(ctx, {
            orderId: order.id,
            reason,
            cancelShipping: true,
        });
        if (isGraphQlErrorResult(result)) {
            throw new Error(`Order ${order.code} could not be cancelled: ${result.message}`);
        }

        await this.connection
            .getRepository(ctx, Order)
            .update(order.id, { customFields: { cancelReason: reason } });
        this.eventBus.publish(new ErpOrderStatusEvent(ctx, order.code, 'CANCELLED'));
        await this.notify(ctx, order, 'info', 'Order cancelled', `Order ${order.code}: ${reason}.`);
        if (payments.some(p => p.state === 'Settled')) {
            await this.notify(
                ctx,
                order,
                'error',
                'Cancelled order has a settled payment',
                `Order ${order.code} was cancelled and needs a manual refund.`,
            );
        }
    }

    async notify(
        ctx: RequestContext,
        order: Order,
        kind: 'info' | 'error',
        title: string,
        message: string,
    ): Promise<void> {
        await this.notificationService.create(ctx, {
            recipientType: 'administrator-broadcast',
            kind,
            sourceType: 'order-cancellation',
            sourceId: `${order.code}:${title}`,
            title,
            message,
        });
    }

    private async decide(
        ctx: RequestContext,
        order: Order,
        requestRegistered: boolean,
    ): Promise<CancelDecision> {
        const payments = await this.connection
            .getRepository(ctx, Payment)
            .find({ where: { order: { id: order.id } } });
        const fields = order.customFields;
        const facts = {
            orderState: order.state,
            erpStatus: fields.erpStatus ?? null,
            erpOrderId: fields.erpOrderId ?? null,
            latestFulfillmentState: fields.latestFulfillmentState ?? null,
            hasSettledPayment: payments.some(p => p.state === 'Settled'),
            cancelRequestStatus: fields.cancelRequestStatus ?? null,
            submission: 'none' as const,
            requestRegistered,
        };
        const first = decideCancellation(facts);
        if (first.action !== 'cancel-without-event') return first;

        const port = this.portRegistry.get();
        const submission = await port.submissionState(ctx, String(order.id));
        const decision = decideCancellation({ ...facts, submission });
        if (decision.action !== 'skip-pending-and-cancel') return decision;

        const skipped = await port.skipPendingSubmission(
            ctx,
            String(order.id),
            'order cancelled before it was sent',
        );
        return skipped ? decision : decideCancellation({ ...facts, submission: 'sent' });
    }

    private async perform(
        ctx: RequestContext,
        order: Order,
        reason: CancelReason,
        decision: CancelDecision,
    ): Promise<CancelOutcome> {
        const repo = this.connection.getRepository(ctx, Order);
        switch (decision.action) {
            case 'already-cancelled':
                return { kind: 'already-cancelled' };
            case 'already-requested':
                return { kind: 'already-requested' };
            case 'leave-to-erp':
                return { kind: 'left-to-erp' };
            case 'refuse':
                return { kind: 'not-cancellable', reason: decision.reason };
            case 'skip-pending-and-cancel':
            case 'cancel-without-event':
                await this.cancelLocally(ctx, order, reason);
                return { kind: 'cancelled', eventSent: false };
            case 'request-only':
            case 'request-and-cancel': {
                await this.requestCancel(ctx, order);
                await repo.update(order.id, {
                    customFields: {
                        cancelRequestedAt: new Date(),
                        cancelReason: reason,
                        cancelRequestStatus: 'REQUESTED',
                    },
                });
                if (decision.action === 'request-only') return { kind: 'cancel-requested' };
                await this.cancelLocally(ctx, order, reason);
                return { kind: 'cancelled', eventSent: true };
            }
        }
    }

    private async requestCancel(ctx: RequestContext, order: Order): Promise<void> {
        const orderUuid = order.customFields.uuid;
        if (!orderUuid) throw new OrderNotEligibleError(`Order ${order.code} has no uuid`);
        await this.portRegistry
            .get()
            .requestCancel(ctx, { orderId: String(order.id), orderUuid, orderCode: order.code });
    }
}
