import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ReservationReconciliationIssueType = 'QUANTITY_MISMATCH' | 'UNRESOLVED_PRODUCT_MAPPING';
export type ReservationReconciliationIssueStatus = 'open' | 'resolved';

// Escalate, never auto-pick a side: local reservation vs ERP confirmed write-off is a human call.
// Unmapped externalProductId must escalate, else it looks unconfirmed and blocks release forever.
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

    @Column({ type: 'varchar', nullable: true })
    productVariantId!: string | null;

    @Column({ type: 'int', nullable: true })
    localQuantity!: number | null;

    @Column({ type: 'int', nullable: true })
    erpQuantity!: number | null;

    // Set only for UNRESOLVED_PRODUCT_MAPPING — the ERP's own productId that this instance couldn't
    // resolve to a ProductVariant at all (see OrderRegistrationResultHandler.findVariantId).
    @Column({ type: 'varchar', nullable: true })
    externalProductId!: string | null;

    // The ERP's own order document id (order_entity_id on the triggering
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
