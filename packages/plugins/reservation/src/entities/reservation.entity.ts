import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { ReservationCreationMethod } from '../types';

export type ReservationStatus = 'active' | 'released' | 'expired';

// Stays active through RESERVED/CONFIRMED: those callbacks don't guarantee ERP wrote off stock.
// Only CANCELLED releases it until the ERP registration-result release is consumed.
@Index('idx_reservation_active_line_location', ['orderLineId', 'stockLocationId'], {
    unique: true,
    where: `"status" = 'active'`,
})
@Entity()
export class Reservation extends UuidEntity {
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

    // Copied at reserveOrder() time. Null means the order has no branch scope, not an error.
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Bumped on re-reserve after a release/expiry; keeps the new hold's idempotency key distinct.
    @Column({ type: 'int', default: 1 })
    reservationGeneration!: number;

    @Column({ type: 'varchar' })
    creationMethod!: ReservationCreationMethod;

    @Column({ type: 'varchar', nullable: true })
    confirmedByAdministratorId!: string | null;

    // Guards against re-logging the needs-intervention warning on every worker poll.
    // Prepaid reservations are never silently released on expiry, so this is their only expiry change.
    @Column({ type: 'timestamp', nullable: true })
    interventionFlaggedAt!: Date | null;

    // Stable so ERP can receive the same confirm command twice without a duplicate document.
    // Must differ from erpReleaseOperationId: sync_outbox eventId is unique, so the two would collide.
    @Column({ type: 'varchar' })
    erpOperationId!: string;

    @Column({ type: 'varchar', nullable: true })
    erpReleaseOperationId!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    erpConfirmedAt!: Date | null;
}
