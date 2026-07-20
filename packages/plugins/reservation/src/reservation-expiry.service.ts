import { Injectable, Logger } from '@nestjs/common';
import { Order } from '@vendure/core';
import { DataSource, In, LessThanOrEqual } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { loggerCtx } from './types';

// Called by ReservationExpiryWorker on a timer — split out of ReservationService to keep that
// file under AGENTS.md's ~300-line guideline. Runs outside any HTTP request, so it uses the raw
// DataSource/EntityManager directly rather than TransactionalConnection (same pattern as
// SyncService.processOutbox — see packages/plugins/sync/src/sync.service.ts).
@Injectable()
export class ReservationExpiryService {
    constructor(private dataSource: DataSource) {}

    // Branches by creationMethod (see docs/order-flow.md "On expiry"):
    //  - non-prepaid ('manual'/'auto-trust-rule'): expire the Reservation and return the order
    //    to AWAITING_CONFIRMATION if it was RESERVED, in the same transaction as the status flip
    //    so the two never drift apart.
    //  - 'auto-prepaid': never silently release a paid customer's stock — the Reservation stays
    //    active. Once per row (guarded by interventionFlaggedAt), log a warning for staff. A
    //    real notification surface is tracked as a separate follow-up, not built here.
    async expireDueReservations(): Promise<number> {
        return this.dataSource.transaction(async manager => {
            const dueRows = await manager.getRepository(Reservation).find({
                where: { status: 'active', expiresAt: LessThanOrEqual(new Date()) },
            });
            if (dueRows.length === 0) {
                return 0;
            }

            const nonPrepaidDue = dueRows.filter(row => row.creationMethod !== 'auto-prepaid');
            const prepaidDue = dueRows.filter(
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
                }
            }

            return nonPrepaidDue.length + prepaidDue.length;
        });
    }
}
