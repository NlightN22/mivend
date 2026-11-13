import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
    EventBus,
    Order,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { withOrderCancelLocks, ctxQueryBounded, getManyBounded } from 'shared';

import { Reservation } from './entities/reservation.entity';
import { readRejectedOrderIdBatch } from './rejected-orders.query';
import { ReservationReleasedEvent } from './reservation.events';
import { ReservationSettings } from './reservation-settings';
import { loggerCtx } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const REJECTED_RELEASE_BATCH = 500;

// Releases the reserve of an order the ERP left REJECTED past the deadline (#204). Each order is
// re-read under the cancel locks (proforma, reserve, order row), the same order a cancel takes.
@Injectable()
export class RejectedOrderReleaseService {
    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private notificationService: NotificationService,
        private eventBus: EventBus,
        private settings: ReservationSettings,
    ) {}

    async releaseDue(): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const rejectedCodes = (
            await ctxQueryBounded<{ code: string }>(
                this.connection,
                ctx,
                `SELECT code FROM order_status_reference WHERE rejected AND NOT "isDeleted"`,
            )
        ).map(row => row.code);
        if (rejectedCodes.length === 0) return 0;

        const cutoff = new Date(Date.now() - this.settings.rejectedOrderReleaseDays() * DAY_MS);
        let released = 0;
        let firstError: unknown;
        let afterId: string | null = null;
        for (;;) {
            const batch = await readRejectedOrderIdBatch(
                this.connection,
                ctx,
                rejectedCodes,
                cutoff,
                afterId,
                REJECTED_RELEASE_BATCH,
            );
            for (const orderId of batch) {
                try {
                    released += await this.releaseOrder(ctx, orderId, rejectedCodes, cutoff);
                } catch (error) {
                    Logger.error(
                        `Rejected-order release of order ${orderId} failed: ${String(error)}`,
                        loggerCtx,
                    );
                    firstError ??= error;
                }
            }
            if (batch.length < REJECTED_RELEASE_BATCH) break;
            afterId = batch[batch.length - 1];
        }
        if (firstError !== undefined) throw firstError;
        return released;
    }

    private async releaseOrder(
        ctx: RequestContext,
        orderId: string,
        rejectedCodes: string[],
        cutoff: Date,
    ): Promise<number> {
        const { rows, orderCode } = await withOrderCancelLocks(
            this.connection,
            ctx,
            orderId,
            txCtx => this.releaseUnderLocks(txCtx, orderId, rejectedCodes, cutoff),
        );
        // After commit: a rolled-back release must not publish events or notify.
        for (const row of rows) {
            this.eventBus.publish(new ReservationReleasedEvent(ctx, row, orderCode));
            await this.notify(ctx, row);
        }
        return rows.length;
    }

    private async releaseUnderLocks(
        ctx: RequestContext,
        orderId: string,
        rejectedCodes: string[],
        cutoff: Date,
    ): Promise<{ rows: Reservation[]; orderCode: string }> {
        const orderRepo = this.connection.getRepository(ctx, Order);
        const order = await orderRepo.findOne({ where: { id: orderId } });
        const fields = order?.customFields;
        if (
            !order ||
            !fields?.erpStatus ||
            !rejectedCodes.includes(fields.erpStatus) ||
            !fields.erpStatusAt ||
            fields.erpStatusAt > cutoff
        ) {
            return { rows: [], orderCode: '' };
        }

        const reservationRepo = this.connection.getRepository(ctx, Reservation);
        const active = await getManyBounded(
            reservationRepo
                .createQueryBuilder('reservation')
                .setLock('pessimistic_write')
                .where('reservation.status = :status', { status: 'active' })
                .andWhere('reservation.orderId = :orderId', { orderId }),
        );
        if (active.length === 0) return { rows: [], orderCode: order.code };

        const releasedAt = new Date();
        for (const row of active) {
            row.status = 'released';
            row.releasedAt = releasedAt;
            row.erpReleaseOperationId = randomUUID();
        }
        for (const row of active) {
            await reservationRepo.update(row.id, {
                status: 'released',
                releasedAt,
                erpReleaseOperationId: row.erpReleaseOperationId,
            });
        }
        await orderRepo.update(order.id, { customFields: { reservationState: 'RELEASED' } });
        return { rows: active, orderCode: order.code };
    }

    // Idempotent by (sourceType, sourceId): a repeat updates the open notification in place.
    private async notify(ctx: RequestContext, row: Reservation): Promise<void> {
        try {
            await this.notificationService.create(ctx, {
                recipientType: 'administrator-broadcast',
                kind: 'error',
                sourceType: 'reservation-rejected-release',
                sourceId: String(row.id),
                orderId: row.orderId,
                title: 'Reservation released after ERP rejection timeout',
                message: `Reservation ${String(row.id)} (order ${row.orderId}) was released after its order stayed REJECTED by the ERP for over ${this.settings.rejectedOrderReleaseDays()} day(s).`,
            });
        } catch (error) {
            // best-effort: the release is already committed; a missed staff broadcast is only logged
            Logger.error(
                `Notification of rejected release ${String(row.id)} failed: ${String(error)}`,
                loggerCtx,
            );
        }
    }
}
