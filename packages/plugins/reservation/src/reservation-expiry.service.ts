import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventBus, Order, RequestContext, RequestContextService } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { DataSource, In, LessThanOrEqual, Raw } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { OrderCancellationService } from './order-cancellation.service';
import type { CancelOutcome } from './order-cancellation.service';
import { ReservationReleasedEvent } from './reservation.events';
import { ReservationSettings } from './reservation-settings';
import { loggerCtx } from './types';

// A registered/in-progress order is left to the ERP's own release job; staff hear about it only
// when the reserve is still active this long after the shared deadline.
const ERP_OWNED_GRACE_MS = 24 * 60 * 60 * 1000;

// Called by the reservation-expiry ScheduledTask; runs outside any HTTP request, so it uses the
// raw DataSource and a fresh RequestContext. Cancel flow: docs/order-contracts.md.
@Injectable()
export class ReservationExpiryService {
    constructor(
        private dataSource: DataSource,
        private requestContextService: RequestContextService,
        private notificationService: NotificationService,
        private eventBus: EventBus,
        private cancellation: OrderCancellationService,
        private settings: ReservationSettings,
    ) {}

    // Branches by creationMethod and REJECTED-order deadline — see docs/order-flow.md
    // "On expiry" and issue #204's own notify-then-release timeout for ERP rejections.
    async expireDueReservations(): Promise<number> {
        const { handled, nonPrepaidDue } = await this.dataSource.transaction(async manager => {
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
                Date.now() - this.settings.rejectedOrderReleaseDays() * 24 * 60 * 60 * 1000,
            );
            const rejectedCodes: string[] = (
                await manager.query(
                    `SELECT code FROM order_status_reference WHERE rejected AND NOT "isDeleted"`,
                )
            ).map((row: { code: string }) => row.code);
            const rejectedOrders = rejectedCodes.length
                ? await manager.getRepository(Order).find({
                      where: {
                          customFields: {
                              erpStatus: In(rejectedCodes),
                              erpStatusAt: LessThanOrEqual(rejectionCutoff),
                          },
                          id: Raw(
                              alias =>
                                  `${alias} IN (SELECT "orderId"::int FROM reservation WHERE status = 'active')`,
                          ),
                      },
                  })
                : [];
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
                return { handled: 0, nonPrepaidDue: [] };
            }

            const nonPrepaidDue = expiryDueRows.filter(
                row => row.creationMethod !== 'auto-prepaid' && !row.interventionFlaggedAt,
            );
            const prepaidDue = expiryDueRows.filter(
                row => row.creationMethod === 'auto-prepaid' && !row.interventionFlaggedAt,
            );

            // issue #42/#87 Part 2: no signed-in administrator on this timer sweep — broadcast
            // instead of guessing a recipient. Shared by both notification branches below.
            const ctx =
                prepaidDue.length > 0 || rejectedDue.length > 0
                    ? await this.requestContextService.create({ apiType: 'admin' })
                    : null;

            const notifications: Parameters<NotificationService['create']>[1][] = [
                ...prepaidDue.map(row => ({
                    recipientType: 'administrator-broadcast' as const,
                    kind: 'error' as const,
                    sourceType: 'reservation-intervention',
                    sourceId: String(row.id),
                    title: 'Prepaid reservation needs manual intervention',
                    message: `Reservation ${String(row.id)} (order ${row.orderId}) expired at ${row.expiresAt.toISOString()} without release.`,
                })),
                ...rejectedDue.map(row => ({
                    recipientType: 'administrator-broadcast' as const,
                    kind: 'error' as const,
                    sourceType: 'reservation-rejected-release',
                    sourceId: String(row.id),
                    title: 'Reservation released after ERP rejection timeout',
                    message: `Reservation ${String(row.id)} (order ${row.orderId}) was released after its order stayed REJECTED by the ERP for over ${this.settings.rejectedOrderReleaseDays()} day(s).`,
                })),
            ];
            // Notify before marking: a failure throws and rolls the transaction back, so the
            // next sweep finds the rows unmarked and retries (at-least-once).
            for (const input of notifications) {
                await this.notificationService.create(ctx!, input);
            }

            if (prepaidDue.length > 0) {
                await manager
                    .getRepository(Reservation)
                    .update(
                        { id: In(prepaidDue.map(row => row.id)) },
                        { interventionFlaggedAt: new Date() },
                    );
                for (const row of prepaidDue) {
                    Logger.warn(
                        `Prepaid reservation ${String(row.id)} (order ${row.orderId}) expired at ` +
                            `${row.expiresAt.toISOString()} without release — needs manual intervention.`,
                        loggerCtx,
                    );
                }
            }

            if (rejectedDue.length > 0) {
                const releasedAt = new Date();
                const rejectedOrdersById = new Map(
                    rejectedOrders.map(order => [String(order.id), order]),
                );

                for (const row of rejectedDue) {
                    const erpReleaseOperationId = randomUUID();
                    await manager.getRepository(Reservation).update(row.id, {
                        status: 'released',
                        releasedAt,
                        erpReleaseOperationId,
                    });

                    const order = rejectedOrdersById.get(String(row.orderId));
                    if (order) {
                        // `repo.update()` of one key, not `.save()` — see returnToConfirmationQueue.
                        await manager.getRepository(Order).update(order.id, {
                            customFields: { reservationState: 'RELEASED' },
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

            return { handled: prepaidDue.length + rejectedDue.length, nonPrepaidDue };
        });
        // Outside the sweep transaction: cancelling takes the order lock and writes the same
        // reservation rows this sweep locked.
        return handled + (await this.expireNonPrepaid(nonPrepaidDue));
    }

    // Pending/unregistered orders are cancelled; a registered or in-progress one is left to the ERP.
    private async expireNonPrepaid(rows: Reservation[]): Promise<number> {
        if (rows.length === 0) return 0;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
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
                        await this.returnToConfirmationQueue(orderId, orderRows);
                        count += orderRows.length;
                    }
                    break;
                case 'cancel-requested':
                case 'already-requested':
                    break;
            }
        }
        if (firstError !== undefined) throw firstError;
        return count;
    }

    private async returnToConfirmationQueue(orderId: string, rows: Reservation[]): Promise<void> {
        await this.dataSource.transaction(async manager => {
            await manager
                .getRepository(Reservation)
                .update(
                    { id: In(rows.map(row => row.id)), status: 'active' },
                    { status: 'expired' },
                );
            const order = await manager.getRepository(Order).findOne({ where: { id: orderId } });
            if (order?.customFields?.reservationState === 'RESERVED') {
                // `repo.update()` of only the changed key — see ReservationService.setOrderReservationState (#209).
                await manager.getRepository(Order).update(order.id, {
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
                    title: 'Reservation past its deadline, order is in the ERP',
                    message: `Reservation ${String(row.id)} (order ${row.orderId}) is still active after its deadline; the order is registered or in progress in the ERP.`,
                });
                await this.dataSource
                    .getRepository(Reservation)
                    .update(
                        { id: row.id, status: 'active' },
                        { interventionFlaggedAt: new Date() },
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
