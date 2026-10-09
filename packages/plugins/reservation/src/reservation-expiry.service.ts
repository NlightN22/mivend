import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventBus, Order, RequestContextService } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { DataSource, In, LessThanOrEqual } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { ReservationReleasedEvent } from './reservation.events';
import { DEFAULT_RESERVATION_DAYS, loggerCtx } from './types';

// Called by the reservation-expiry ScheduledTask on a timer — split out of ReservationService to keep that
// file under AGENTS.md's ~300-line guideline. Runs outside any HTTP request, so it uses the raw
// DataSource/EntityManager directly rather than TransactionalConnection (same pattern as
// SyncService.processOutbox — see packages/plugins/sync/src/sync.service.ts). NotificationService
// still needs a real RequestContext (TransactionalConnection.getRepository requires one), built
// fresh here via RequestContextService — mirrors ReconciliationService.runComparison's own
// scheduled-task ctx construction (packages/plugins/erp-integration).
@Injectable()
export class ReservationExpiryService {
    constructor(
        private dataSource: DataSource,
        private requestContextService: RequestContextService,
        private notificationService: NotificationService,
        private eventBus: EventBus,
    ) {}

    // Branches by creationMethod and REJECTED-order deadline — see docs/order-flow.md
    // "On expiry" and issue #204's own notify-then-release timeout for ERP rejections.
    async expireDueReservations(): Promise<number> {
        return this.dataSource.transaction(async manager => {
            // SKIP LOCKED: a concurrent sweep must skip rows another sweep already holds, not
            // block on or re-read them, or both fire the same notification/event side effects.
            const dueRows = await manager
                .getRepository(Reservation)
                .createQueryBuilder('reservation')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .where('reservation.status = :status', { status: 'active' })
                .andWhere('reservation.expiresAt <= :now', { now: new Date() })
                .getMany();

            const rejectionCutoff = new Date(
                Date.now() - DEFAULT_RESERVATION_DAYS * 24 * 60 * 60 * 1000,
            );
            const rejectedOrders = await manager.getRepository(Order).find({
                where: {
                    customFields: {
                        erpStatus: 'REJECTED',
                        erpStatusAt: LessThanOrEqual(rejectionCutoff),
                    },
                },
            });
            const rejectedOrderIds = rejectedOrders.map(order => String(order.id));
            const rejectedDue = rejectedOrderIds.length
                ? await manager
                      .getRepository(Reservation)
                      .createQueryBuilder('reservation')
                      .setLock('pessimistic_write')
                      .setOnLocked('skip_locked')
                      .where('reservation.status = :status', { status: 'active' })
                      .andWhere('reservation.orderId IN (:...orderIds)', {
                          orderIds: rejectedOrderIds,
                      })
                      .getMany()
                : [];
            const rejectedDueIds = new Set(rejectedDue.map(row => row.id));
            const expiryDueRows = dueRows.filter(row => !rejectedDueIds.has(row.id));

            if (expiryDueRows.length === 0 && rejectedDue.length === 0) {
                return 0;
            }

            const nonPrepaidDue = expiryDueRows.filter(
                row => row.creationMethod !== 'auto-prepaid',
            );
            const prepaidDue = expiryDueRows.filter(
                row => row.creationMethod === 'auto-prepaid' && !row.interventionFlaggedAt,
            );

            if (nonPrepaidDue.length > 0) {
                await manager
                    .getRepository(Reservation)
                    .update({ id: In(nonPrepaidDue.map(row => row.id)) }, { status: 'expired' });

                const orderIds = [...new Set(nonPrepaidDue.map(row => row.orderId))];
                const orders = await manager
                    .getRepository(Order)
                    .find({ where: { id: In(orderIds) } });
                for (const order of orders) {
                    if (order.customFields?.reservationState === 'RESERVED') {
                        // `repo.update()`, not `.save(order)` — same gotcha documented on
                        // ReservationService.setOrderReservationState: `order` here is loaded with
                        // no relations at all (plain `.find()` above), so `.save()` throws trying
                        // to recompute `discounts`/`taxSummary`, which require `lines`/`surcharges`
                        // to be joined. Real incident this fixes: every expiry sweep run was
                        // crashing the whole transaction on this line, so due reservations were
                        // never actually being expired at all — confirmed via [ReservationPlugin]
                        // "Reservation expiry job failed: The property 'discounts' on the Order
                        // entity requires the Order.lines relation to be joined" in server logs.
                        await manager.getRepository(Order).update(order.id, {
                            customFields: {
                                ...order.customFields,
                                reservationState: 'AWAITING_CONFIRMATION',
                            },
                        });
                    }
                }
            }

            // issue #42/#87 Part 2: no signed-in administrator on this timer sweep — broadcast
            // instead of guessing a recipient. Shared by both notification branches below.
            const ctx =
                prepaidDue.length > 0 || rejectedDue.length > 0
                    ? await this.requestContextService.create({ apiType: 'admin' })
                    : null;

            if (prepaidDue.length > 0) {
                const flaggedAt = new Date();
                await manager
                    .getRepository(Reservation)
                    .update(
                        { id: In(prepaidDue.map(row => row.id)) },
                        { interventionFlaggedAt: flaggedAt },
                    );
                for (const row of prepaidDue) {
                    Logger.warn(
                        `Prepaid reservation ${String(row.id)} (order ${row.orderId}) expired at ` +
                            `${row.expiresAt.toISOString()} without release — needs manual intervention.`,
                        loggerCtx,
                    );
                    await this.notificationService.create(ctx!, {
                        recipientType: 'administrator-broadcast',
                        kind: 'error',
                        sourceType: 'reservation-intervention',
                        sourceId: String(row.id),
                        title: 'Prepaid reservation needs manual intervention',
                        message: `Reservation ${String(row.id)} (order ${row.orderId}) expired at ${row.expiresAt.toISOString()} without release.`,
                    });
                }
            }

            if (rejectedDue.length > 0) {
                const releasedAt = new Date();
                const rejectedOrdersById = new Map(
                    rejectedOrders.map(order => [String(order.id), order]),
                );

                for (const row of rejectedDue) {
                    await this.notificationService.create(ctx!, {
                        recipientType: 'administrator-broadcast',
                        kind: 'error',
                        sourceType: 'reservation-rejected-release',
                        sourceId: String(row.id),
                        title: 'Reservation released after ERP rejection timeout',
                        message: `Reservation ${String(row.id)} (order ${row.orderId}) was released after its order stayed REJECTED by the ERP for over ${DEFAULT_RESERVATION_DAYS} day(s).`,
                    });

                    const erpReleaseOperationId = randomUUID();
                    await manager
                        .getRepository(Reservation)
                        .update(row.id, { status: 'released', releasedAt, erpReleaseOperationId });

                    const order = rejectedOrdersById.get(String(row.orderId));
                    if (order) {
                        // Same `repo.update()`-not-`.save()` gotcha as the non-prepaid branch above.
                        await manager.getRepository(Order).update(order.id, {
                            customFields: { ...order.customFields, reservationState: 'RELEASED' },
                        });
                    }

                    this.eventBus.publish(
                        new ReservationReleasedEvent(
                            ctx!,
                            Object.assign(new Reservation(), row, {
                                status: 'released',
                                releasedAt,
                                erpReleaseOperationId,
                            }),
                            String(row.orderId),
                        ),
                    );
                }
            }

            return nonPrepaidDue.length + prepaidDue.length + rejectedDue.length;
        });
    }
}
