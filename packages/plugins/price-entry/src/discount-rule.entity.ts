import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Exactly one trigger shape per row: facet/priceType threshold, or per-product promo, never both.
// Counterparty/contract rules are DiscountSetup documents, not rows here.
// Gift-type `percent` is an int column, so it only approximates a free gift (GIFT_TYPE_PERCENT).
export type DiscountRuleOperationKind =
    | 'percent-discount'
    | 'gift-one-from-list'
    | 'gift-all-from-list';

@Entity()
@Index(['erpId'], { unique: true })
export class DiscountRule extends VendureEntity {
    constructor(input?: DeepPartial<DiscountRule>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    priceTypeCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    facetCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    facetValueCode!: string | null;

    @Column({ type: 'int' })
    percent!: number;

    @Column({ type: 'timestamp' })
    validFrom!: Date;

    // Null for a promo without an end date: stored, never applied (#282).
    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    @Column({ type: 'float', nullable: true })
    minWeightKg!: number | null;

    // Kopecks, not rubles. Mutually exclusive with minWeightKg: a rule uses one metric, never both.
    @Column({ type: 'bigint', nullable: true })
    minAmount!: number | null;

    // Raw ERP id (Product.customFields.externalid), not a local id; null for facet/priceType rules.
    @Column({ type: 'varchar', nullable: true })
    triggerProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    triggerQuantity!: number | null;

    // Null for percent-type rules: `percent` then applies to the trigger product's own line.
    // Always null for facet/priceType rules.
    @Column({ type: 'varchar', nullable: true })
    giftProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    giftQuantity!: number | null;

    // Translated by promo-rule.handler.ts before storage; raw ERP strings are never stored.
    @Column({ type: 'varchar', nullable: true })
    operationKind!: DiscountRuleOperationKind | null;
}
