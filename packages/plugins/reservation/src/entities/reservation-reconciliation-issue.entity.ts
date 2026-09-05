import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ReservationReconciliationIssueType = 'QUANTITY_MISMATCH' | 'UNRESOLVED_PRODUCT_MAPPING';
export type ReservationReconciliationIssueStatus = 'open' | 'resolved';

// A detected drift between mivend's own reservation state and 1C's own confirmed write-off
// (company.orders.events.v1.order-registration-result, issue #75) — for a human to resolve,
// never auto-picked one way or the other. Mirrors plugin-acquiring's PaymentReconciliationIssue
// (same "escalate, don't guess" convention, see docs/testing-patterns.md's "Source ownership"
// pattern). Two shapes share this table: QUANTITY_MISMATCH (productVariantId/localQuantity/
// erpQuantity all set — a matched variant whose confirmed quantity disagrees with the local
// reservation) and UNRESOLVED_PRODUCT_MAPPING (externalProductId set instead — 1C confirmed a
// productId this instance has no ProductVariant.customFields.externalId mapping for at all, so
// it can never be matched/released; mivend.audit.72's HIGH finding on the first version of this
// service: an unresolvable mapping was previously indistinguishable from "1C hasn't confirmed
// this line yet," silently blocking release forever with no escalation).
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

    // Set only for UNRESOLVED_PRODUCT_MAPPING — 1C's own productId that this instance couldn't
    // resolve to a ProductVariant at all (see OrderRegistrationResultHandler.findVariantId).
    @Column({ type: 'varchar', nullable: true })
    externalProductId!: string | null;

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
