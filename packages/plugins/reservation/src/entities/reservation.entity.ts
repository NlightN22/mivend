import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ReservationStatus = 'active' | 'released' | 'expired';

// One row per order line — created when a manager/operator confirms an order (see
// ReservationService.confirmOrder). Soft reservation only: reduces "available to sell"
// (stockOnHand - active reservations) for other orders/catalog, never touches stockOnHand
// itself (see docs/architecture.md "Reservation: soft reservation per warehouse").
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
}
