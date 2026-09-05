import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ReservationReconciliationIssueType = 'QUANTITY_MISMATCH';
export type ReservationReconciliationIssueStatus = 'open' | 'resolved';

// A detected drift between a local Reservation's quantity and 1C's own confirmed write-off
// quantity (company.orders.events.v1.order-registration-result's reservedLines, issue #75) — for
// a human to resolve, never auto-picked one way or the other. Mirrors plugin-acquiring's
// PaymentReconciliationIssue (same "escalate, don't guess" convention, see
// docs/testing-patterns.md's "Source ownership" pattern).
@Entity()
export class ReservationReconciliationIssue extends VendureEntity {
    constructor(input?: DeepPartial<ReservationReconciliationIssue>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    issueType!: ReservationReconciliationIssueType;

    @Index()
    @Column({ type: 'varchar' })
    orderId!: string;

    @Column({ type: 'varchar' })
    productVariantId!: string;

    @Column({ type: 'int' })
    localQuantity!: number;

    @Column({ type: 'int' })
    erpQuantity!: number;

    // 1C's own order document id (order_entity_id on the triggering
    // order-registration-result) — the traceability reference back to the source event.
    @Column({ type: 'varchar' })
    orderEntityId!: string;

    @Column({ type: 'timestamp' })
    detectedAt!: Date;

    @Column({ type: 'varchar', default: 'open' })
    status!: ReservationReconciliationIssueStatus;

    @Column({ type: 'varchar', nullable: true })
    resolution!: string | null;
}
