import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { VatFlagReason } from '../vat-code-resolver';

// A non-blocking "succeeded but worth reviewing" signal for a product's VAT code (issue #79) —
// categorically different from IntegrationInboxEvent.status = 'failed', which is for actual
// processing failures. Mirrors ReservationReconciliationIssue/PaymentReconciliationIssue's shape,
// but deliberately has no status/resolution workflow: a first pass only needs a bare, readable
// record, not a triage flow (out of scope per issue #79).
@Entity()
export class ProductTaxCodeFlag extends VendureEntity {
    constructor(input?: DeepPartial<ProductTaxCodeFlag>) {
        super(input);
    }

    // Integration Service's own product entity id (ProductStreamHandler's `entityId`), not
    // Vendure's Product.id — traceability back to the source event, same convention as
    // ReservationReconciliationIssue.orderEntityId.
    @Index()
    @Column({ type: 'varchar' })
    externalProductId!: string;

    // The raw, unmodified `СтавкаНДС` value seen on the product (may be empty string).
    @Column({ type: 'varchar' })
    rawVatCode!: string;

    @Column({ type: 'varchar' })
    reason!: VatFlagReason;

    @Column({ type: 'varchar' })
    detail!: string;

    @Column({ type: 'timestamp' })
    detectedAt!: Date;
}
