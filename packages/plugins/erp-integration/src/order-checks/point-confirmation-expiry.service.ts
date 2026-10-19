import { Injectable, Logger } from '@nestjs/common';
import {
    Order,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { OrderCancellationService, ReservationSettings } from '@mivend/plugin-reservation';
import type { CancelOutcome } from '@mivend/plugin-reservation';
import { ctxQuery, withAggregateLock } from 'shared';

import { COURIER_POINT_UNCONFIRMED_SKIP_REASON } from '../order-submitted.builder';

const loggerCtx = 'PointConfirmationExpiry';
const SWEEP_LIMIT = 200;
const DUE_FROM = `FROM integration_outbox x
               JOIN "order" o ON o.id::text = x.payload ->> 'orderId'
              WHERE x.event_type = 'order.confirmed' AND x.status = 'skipped' AND x.last_error = $1
                AND o.state <> 'Cancelled'
                AND o."orderPlacedAt" + make_interval(days => COALESCE(o."customFieldsReservationdays", $2::int)) <= now()`;
export const POINT_CONFIRMATION_EXPIRED_SOURCE = 'point-confirmation-expired';

export interface WaitingOrder {
    id: string;
    code: string;
}

export type ExpiryAction = 'done' | 'notify';

// Plain-English reason for staff; 'left-to-erp' means the ERP already holds the order.
export function describeRefusal(outcome: CancelOutcome): string {
    switch (outcome.kind) {
        case 'left-to-erp':
            return 'the order is registered in the ERP and is left to it';
        case 'not-cancellable':
            switch (outcome.reason) {
                case 'paid':
                    return 'the order has a settled payment';
                case 'in-progress':
                    return 'the order is already being processed';
                case 'shipped':
                    return 'the order has been shipped';
                case 'registration-rejected':
                    return 'the ERP rejected the order registration';
            }
            break;
    }
    return 'the cancel flow refused it';
}

// Cancelled (or a cancel already in flight) ends the wait, and so does a deadline that moved or a point confirmed since the sweep read it; anything the cancel flow refuses needs staff.
export function expiryActionFor(outcome: CancelOutcome): ExpiryAction {
    switch (outcome.kind) {
        case 'cancelled':
        case 'already-cancelled':
        case 'cancel-requested':
        case 'already-requested':
            return 'done';
        case 'reserve-not-due':
            return 'done';
        case 'left-to-erp':
        case 'not-cancellable':
            return 'notify';
    }
}

// A courier order waiting for its customer-added point to be confirmed lives as long as a reservation
// (order days or the default, from placement); then it is cancelled or, if it cannot be, staff are told once.
@Injectable()
export class PointConfirmationExpiryService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly cancellation: OrderCancellationService,
        private readonly notificationService: NotificationService,
        private readonly settings: ReservationSettings,
    ) {}

    async expireDue(): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const due = await this.findDue(ctx);
        if (due.length === 0) return 0;
        let handled = 0;
        let firstError: unknown;
        for (const order of due) {
            try {
                const outcome = await this.cancellation.cancel(
                    ctx,
                    order.id,
                    'point-confirmation-expired',
                    { stillDue: (txCtx, locked) => this.isStillDue(txCtx, locked) },
                );
                if (expiryActionFor(outcome) === 'notify')
                    await this.notifyOnce(ctx, order, outcome);
                handled += 1;
            } catch (error) {
                // One failing order must not starve the others; the sweep fails after the loop.
                Logger.error(
                    `Point-confirmation expiry of order ${order.id} failed: ${String(error)}`,
                    loggerCtx,
                );
                firstError ??= error;
            }
        }
        if (firstError !== undefined) throw firstError;
        return handled;
    }

    private async isStillDue(ctx: RequestContext, order: Order): Promise<boolean> {
        const rows: unknown[] = await this.connection
            .getRepository(ctx, Order)
            .query(`SELECT 1 ${DUE_FROM} AND o.id::text = $3 LIMIT 1`, [
                COURIER_POINT_UNCONFIRMED_SKIP_REASON,
                this.settings.defaultReservationDays(),
                String(order.id),
            ]);
        return rows.length > 0;
    }

    private findDue(ctx: RequestContext): Promise<WaitingOrder[]> {
        return ctxQuery<WaitingOrder[]>(
            this.connection,
            ctx,
            `SELECT DISTINCT o.id::text AS id, o.code, o."orderPlacedAt"
               ${DUE_FROM}
              ORDER BY o."orderPlacedAt" LIMIT ${SWEEP_LIMIT}`,
            [COURIER_POINT_UNCONFIRMED_SKIP_REASON, this.settings.defaultReservationDays()],
        );
    }

    // The advisory lock + existence check keep it to one notification per order across sweeps and concurrent sweeps.
    private async notifyOnce(
        ctx: RequestContext,
        order: WaitingOrder,
        outcome: CancelOutcome,
    ): Promise<void> {
        const lockKey = `${POINT_CONFIRMATION_EXPIRED_SOURCE}:${order.id}`;
        await withAggregateLock(this.connection, ctx, lockKey, async txCtx => {
            const existing = await ctxQuery<unknown[]>(
                this.connection,
                txCtx,
                'SELECT 1 FROM notification WHERE "sourceType" = $1 AND "sourceId" = $2 LIMIT 1',
                [POINT_CONFIRMATION_EXPIRED_SOURCE, order.id],
            );
            if (existing.length > 0) return;
            await this.notificationService.create(txCtx, {
                recipientType: 'administrator-broadcast',
                kind: 'warning',
                sourceType: POINT_CONFIRMATION_EXPIRED_SOURCE,
                sourceId: order.id,
                title: 'Order waiting for a delivery point confirmation has expired',
                message: `Order ${order.code} passed its validity period while its delivery point is unconfirmed and cannot be cancelled automatically (${describeRefusal(outcome)}).`,
            });
        });
    }
}
