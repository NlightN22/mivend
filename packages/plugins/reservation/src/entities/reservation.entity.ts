import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { ReservationCreationMethod } from '../types';

export type ReservationStatus = 'active' | 'released' | 'expired';

// One row per order line — created by ReservationService.reserveOrder() (manual confirm today,
// auto-prepaid/auto-trust-rule later — see docs/order-flow.md). Soft reservation only: reduces
// ATP (stockOnHand - stockAllocated - active reservations) for other orders/catalog, never
// touches stockOnHand/stockAllocated itself.
//
// Released as soon as 1C confirms it (RESERVED/CONFIRMED — see ReservationErpSyncService), not
// held until physical shipment. Earlier revision of this comment described an intermediate
// "allocated" status bridging confirmation to shipment through Vendure's native
// StockLevel.stockAllocated, mirroring the industry-standard "soft reservation -> hard
// allocation" pattern — reverted (2026-09-05): 1C writes off physical stock as a direct,
// same-transaction consequence of posting/confirming the order, not at a later shipment step, so
// holding the quantity locally all the way to SHIPPED/DELIVERED would have meant needlessly
// blocking sales of stock 1C had already committed elsewhere, for however long its own
// assembly/shipping logistics chain takes (real business priority: never over-restrict what can
// be sold). Releasing at confirmation trusts that 1C's own StockChanged will catch up shortly;
// the short window until it does is the same accepted residual risk #73's nightly reconciliation
// worker exists to catch, not something this row can close on its own. SHIPPED/DELIVERED also
// trigger the same release, as an idempotent fallback in case a CONFIRMED callback was missed.
//
// At most one active reservation per (orderLineId, stockLocationId) — enforced by the partial
// unique index below, the DB-level safety net docs/order-flow.md's "Idempotency" section calls
// for (same idiom as plugin-sync's sync_outbox unique-eventId index).
@Index('idx_reservation_active_line_location', ['orderLineId', 'stockLocationId'], {
    unique: true,
    where: `"status" = 'active'`,
})
@Entity()
export class Reservation extends VendureEntity {
    constructor(input?: DeepPartial<Reservation>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    orderId!: string;

    @Column({ type: 'varchar' })
    orderLineId!: string;

    @Index()
    @Column({ type: 'varchar' })
    productVariantId!: string;

    @Column({ type: 'int' })
    quantity!: number;

    @Index()
    @Column({ type: 'varchar' })
    status!: ReservationStatus;

    @Column({ type: 'timestamp' })
    reservedAt!: Date;

    @Column({ type: 'timestamp' })
    expiresAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    releasedAt!: Date | null;

    @Index()
    @Column({ type: 'varchar' })
    stockLocationId!: string;

    // Denormalized from the order's customFields.branchId at reserveOrder() time (itself
    // denormalized from the customer's preferred TradingPoint — see ErpOrderService and
    // docs/access-control.md's branch-scope axis). Nullable: an order with no resolved trading
    // point simply has no branch scope, same as any other optional custom field.
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Bumped each time a line is re-reserved after a prior hold on it was released/expired —
    // part of the idempotency key docs/order-flow.md describes
    // (orderId + orderLineId + stockLocationId + reservationGeneration).
    @Column({ type: 'int', default: 1 })
    reservationGeneration!: number;

    @Column({ type: 'varchar' })
    creationMethod!: ReservationCreationMethod;

    @Column({ type: 'varchar', nullable: true })
    confirmedByAdministratorId!: string | null;

    // Set once when an auto-prepaid reservation is found past-due (see
    // ReservationService.expireDueReservations) — guards against re-logging the same
    // needs-intervention warning on every worker poll. Prepaid reservations are never silently
    // released, so this is the only state change that happens on their expiry today (see
    // docs/order-flow.md "On expiry"); a real staff notification is tracked separately.
    @Column({ type: 'timestamp', nullable: true })
    interventionFlaggedAt!: Date | null;

    // Stable idempotency key for the 1C outbox "confirmed" command (see docs/order-flow.md "1C
    // integration" — "Each command needs a stable reservationOperationId so 1C can safely
    // receive the same command twice without creating a duplicate document/reservation").
    // Generated once at reserveOrder() write time; used as sync_outbox's eventId by
    // plugin-sync's ReservationConsumer. A separate id is used for the "released" command (see
    // erpReleaseOperationId) — sync_outbox's eventId is unique, so confirm and release can never
    // share one without colliding.
    @Column({ type: 'varchar' })
    erpOperationId!: string;

    @Column({ type: 'varchar', nullable: true })
    erpReleaseOperationId!: string | null;

    // Set once when 1C's own order-status callback reports RESERVED/CONFIRMED for this
    // reservation's order — closes the loop for staff visibility that 1C actually picked up
    // the command (see ReservationService.handleErpOrderStatus).
    @Column({ type: 'timestamp', nullable: true })
    erpConfirmedAt!: Date | null;
}
