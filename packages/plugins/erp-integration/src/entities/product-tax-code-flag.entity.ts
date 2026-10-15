import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { VatFlagReason } from '../vat-code-resolver';

// Non-blocking review signal, distinct from IntegrationInboxEvent.status = 'failed' (real failures).
// No status/resolution workflow by design: a bare record for a first pass, no triage flow.
@Entity()
export class ProductTaxCodeFlag extends VendureEntity {
    constructor(input?: DeepPartial<ProductTaxCodeFlag>) {
        super(input);
    }

    // Integration Service's entity id (ProductStreamHandler's entityId), not Vendure's Product.id.
    // Kept to trace back to the source event, as in ReservationReconciliationIssue.orderEntityId.
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
