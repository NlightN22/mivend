import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { ReservationCreationMethod } from '../types';

// 'allocated': 1C confirmed this reservation (RESERVED/CONFIRMED) and its quantity was moved
// into Vendure's own native StockLevel.stockAllocated (see ReservationErpSyncService) — the
// industry-standard "soft reservation -> hard allocation" transition, done at confirmation time
// rather than at physical shipment. No longer counted as an "active reservation" in the ATP
// formula (ReservationAvailabilityService only sums 'active' rows) since it's now inside
// stockAllocated instead — never both, to avoid double-subtracting the same held unit.
export type ReservationStatus = 'active' | 'allocated' | 'released' | 'expired';

// One row per order line — created by ReservationService.reserveOrder() (manual confirm today,
// auto-prepaid/auto-trust-rule later — see docs/order-flow.md). Starts as a soft reservation
// (reduces ATP via stockOnHand - stockAllocated - active reservations, never touching
// stockOnHand/stockAllocated itself); once 1C confirms it, ReservationErpSyncService converts it
// into Vendure's native stockAllocated and moves this row to 'allocated' (see ReservationStatus's
// own doc comment) — from that point on, stockAllocated (not this row) is what protects the
// held quantity, until 1C reports the goods actually shipped (which decrements stockAllocated
// back down and finally releases this row) or the order is cancelled first.
//
// At most one active reservation per (orderLineId, stockLocationId) — enforced by the partial
// unique index below, the DB-level safety net docs/order-flow.md's "Idempotency" section calls
// for (same idiom as plugin-sync's sync_outbox unique-eventId index). Deliberately still scoped
// to status='active' only, not 'allocated' too — widening it would need a real migration in a
// synchronize:false production DB (no migration tooling exists in this repo yet); the
// application-level idempotency guard in ReservationService.reserveOrder (checks for an existing
// active OR allocated row) is the actual enforcement point for the allocated state instead.
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
