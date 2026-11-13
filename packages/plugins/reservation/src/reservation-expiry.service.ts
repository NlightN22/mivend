import { Injectable, Logger } from '@nestjs/common';
import {
    Order,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { withSavepoint } from 'shared';
import { In, LessThanOrEqual } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { OrderCancellationService } from './order-cancellation.service';
import type { CancelOutcome } from './order-cancellation.service';
import { RejectedOrderReleaseService } from './rejected-order-release.service';
import { loggerCtx } from './types';

// A registered/in-progress order is left to the ERP's own release job; staff hear about it only
// when the reserve is still active this long after the shared deadline.
const ERP_OWNED_GRACE_MS = 24 * 60 * 60 * 1000;

const SWEEP_BATCH_SIZE = 200;

// Called by the reservation-expiry ScheduledTask with a fresh RequestContext. Cancel flow: docs/order-contracts.md.
@Injectable()
export class ReservationExpiryService {
    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private notificationService: NotificationService,
        private cancellation: OrderCancellationService,
        private rejectedRelease: RejectedOrderReleaseService,
    ) {}

    // Rejected orders first (their reserve is released and committed), then the TTL deadline (docs/order-flow.md "On expiry").
    async expireDueReservations(): Promise<number> {
        const rejectedReleased = await this.rejectedRelease.releaseDue();
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        let total = rejectedReleased;
        let firstError: unknown;
        let afterId: string | null = null;
        for (;;) {
            const batch = await this.connection.withTransaction(ctx, txCtx =>
                this.sweepBatch(txCtx, afterId),
            );
            total += batch.flagged;
            // Outside the batch transaction: cancelling takes the order lock and writes the same
            // reservation rows the batch locked.
            try {
                total += await this.expireNonPrepaid(ctx, batch.nonPrepaidDue);
            } catch (error) {
                firstError ??= error;
            }
            if (batch.size < SWEEP_BATCH_SIZE || batch.lastId === null) break;
            afterId = batch.lastId;
        }
        if (firstError !== undefined) throw firstError;
        return total;
    }

    // SKIP LOCKED: a concurrent sweep must skip rows another sweep already holds, or both fire the same side effects.
    // Keyset by id: rows that stay active after a batch (left to the ERP) are never re-read within one sweep.
    private async sweepBatch(
        ctx: RequestContext,
        afterId: string | null,
    ): Promise<{
        flagged: number;
        nonPrepaidDue: Reservation[];
        size: number;
        lastId: string | null;
    }> {
        const query = this.connection
            .getRepository(ctx, Reservation)
            .createQueryBuilder('reservation')
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .where('reservation.status = :status', { status: 'active' })
            .andWhere('reservation.expiresAt <= :now', { now: new Date() })
            .andWhere('reservation.interventionFlaggedAt IS NULL');
        if (afterId !== null) query.andWhere('reservation.id > :afterId', { afterId });
        const dueRows = await query
            .orderBy('reservation.id', 'ASC')
            .limit(SWEEP_BATCH_SIZE)
            .getMany();
        const nonPrepaidDue = dueRows.filter(row => row.creationMethod !== 'auto-prepaid');
        const prepaidDue = dueRows.filter(row => row.creationMethod === 'auto-prepaid');
        return {
            flagged: await this.flagPrepaid(ctx, prepaidDue),
            nonPrepaidDue,
            size: dueRows.length,
            lastId: dueRows.length > 0 ? String(dueRows[dueRows.length - 1]!.id) : null,
        };
    }

    // A prepaid reserve is never expired automatically; staff are told once. The notification is
    // idempotent by (sourceType, sourceId); the savepoint keeps a failed one from aborting the sweep.
    private async flagPrepaid(ctx: RequestContext, rows: Reservation[]): Promise<number> {
        if (rows.length === 0) return 0;
        // No signed-in administrator on this timer sweep: broadcast instead of guessing a recipient.
        const notified: Reservation[] = [];
        for (const row of rows) {
            try {
                await withSavepoint(this.connection, ctx, () =>
                    this.notificationService.create(ctx, {
                        recipientType: 'administrator-broadcast',
                        kind: 'error',
                        sourceType: 'reservation-intervention',
                        sourceId: String(row.id),
                        orderId: row.orderId,
                        title: 'Prepaid reservation needs manual intervention',
                        message: `Reservation ${String(row.id)} (order ${row.orderId}) expired at ${row.expiresAt.toISOString()} without release.`,
                    }),
                );
                notified.push(row);
            } catch (error) {
                Logger.error(
                    `Reservation notification prepaid:${String(row.id)} failed: ${(error as Error).message}`,
                    loggerCtx,
                );
            }
        }
        if (notified.length === 0) return 0;
        await this.connection
            .getRepository(ctx, Reservation)
            .update({ id: In(notified.map(row => row.id)) }, { interventionFlaggedAt: new Date() });
        for (const row of notified) {
            Logger.warn(
                `Prepaid reservation ${String(row.id)} (order ${row.orderId}) expired at ` +
                    `${row.expiresAt.toISOString()} without release — needs manual intervention.`,
                loggerCtx,
            );
        }
        return notified.length;
    }

    // Pending/unregistered orders are cancelled; a registered or in-progress one is left to the ERP.
    private async expireNonPrepaid(ctx: RequestContext, rows: Reservation[]): Promise<number> {
        if (rows.length === 0) return 0;
        const sweptAt = new Date();
        const rowsByOrder = new Map<string, Reservation[]>();
        for (const row of rows) {
            rowsByOrder.set(row.orderId, [...(rowsByOrder.get(row.orderId) ?? []), row]);
        }

        let count = 0;
        let firstError: unknown;
        for (const [orderId, orderRows] of rowsByOrder) {
            let outcome: CancelOutcome;
            try {
                outcome = await this.cancellation.cancel(ctx, orderId, 'reserve-expired', {
                    requestRegistered: false,
                    reserveDueBy: sweptAt,
                });
            } catch (error) {
                // One failing order must not starve the others; the sweep fails after the loop.
                Logger.error(
                    `Expiry cancel of order ${orderId} failed: ${String(error)}`,
                    loggerCtx,
                );
                firstError ??= error;
                continue;
            }
            switch (outcome.kind) {
                case 'cancelled':
                case 'already-cancelled':
                    count += orderRows.length;
                    break;
                case 'left-to-erp':
                    await this.flagErpOwned(ctx, orderRows);
                    break;
                case 'not-cancellable':
                    if (outcome.reason === 'shipped' || outcome.reason === 'in-progress') {
                        await this.flagErpOwned(ctx, orderRows);
                    } else {
                        await this.returnToConfirmationQueue(ctx, orderId, orderRows);
                        count += orderRows.length;
                    }
                    break;
                case 'cancel-requested':
                case 'already-requested':
                case 'reserve-not-due':
                    break;
            }
        }
        if (firstError !== undefined) throw firstError;
        return count;
    }

    private async returnToConfirmationQueue(
        ctx: RequestContext,
        orderId: string,
        rows: Reservation[],
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            await this.connection.getRepository(txCtx, Reservation).update(
                {
                    id: In(rows.map(row => row.id)),
                    status: 'active',
                    expiresAt: LessThanOrEqual(new Date()),
                },
                { status: 'expired' },
            );
            const order = await this.connection
                .getRepository(txCtx, Order)
                .findOne({ where: { id: orderId } });
            if (order?.customFields?.reservationState === 'RESERVED') {
                // `repo.update()` of only the changed key (#209).
                await this.connection.getRepository(txCtx, Order).update(order.id, {
                    customFields: { reservationState: 'AWAITING_CONFIRMATION' },
                });
            }
        });
    }

    private async flagErpOwned(ctx: RequestContext, rows: Reservation[]): Promise<void> {
        const cutoff = Date.now() - ERP_OWNED_GRACE_MS;
        for (const row of rows.filter(r => r.expiresAt.getTime() <= cutoff)) {
            try {
                // Notify first, then mark: a failed notification leaves the row unmarked for the next sweep.
                await this.notificationService.create(ctx, {
                    recipientType: 'administrator-broadcast',
                    kind: 'warning',
                    sourceType: 'reservation-erp-owned',
                    sourceId: String(row.id),
                    orderId: row.orderId,
                    title: 'Reservation past its deadline, order is in the ERP',
                    message: `Reservation ${String(row.id)} (order ${row.orderId}) is still active after its deadline; the order is registered or in progress in the ERP.`,
                });
                await this.connection.withTransaction(ctx, txCtx =>
                    this.connection
                        .getRepository(txCtx, Reservation)
                        .update(
                            { id: row.id, status: 'active' },
                            { interventionFlaggedAt: new Date() },
                        ),
                );
            } catch (error) {
                Logger.error(
                    `ERP-owned flag of reservation ${String(row.id)} failed: ${String(error)}`,
                    loggerCtx,
                );
            }
        }
    }
}
