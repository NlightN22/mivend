import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Shipment-time confirmed discount fact from the ERP (GrantedDiscountChanged, issue #101) — one
// row per shipment document line. Read-only record: never feeds price resolution. See
// docs/ai/erp-streams-map.md's "Order-time discount confirmation" section.
@Entity()
export class GrantedDiscount extends VendureEntity {
    constructor(input?: DeepPartial<GrantedDiscount>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    sourceDocumentId!: string;

    @Index()
    @Column({ type: 'varchar' })
    counterpartyErpId!: string;

    @Column({ type: 'varchar' })
    productErpId!: string;

    // Plain ERP id, deliberately not a hard link: a shipment line may reference an order that was
    // never created in mivend.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    orderEntityId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    discountDocumentId!: string | null;

    @Column({ type: 'varchar' })
    discountRuleRecipientId!: string;

    // Opaque ERP classifier text (closed 1C enum, see search-platform#126) — display only.
    @Column({ type: 'varchar', nullable: true })
    condition!: string | null;

    // Raw ERP currency units, not kopecks.
    @Column({ type: 'float' })
    discountAmount!: number;

    @Column({ type: 'varchar' })
    sourceVersion!: string;

    // Set by a 1C unposting tombstone; the row keeps the tombstone's version so a same-version
    // delayed upsert cannot resurrect it.
    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
