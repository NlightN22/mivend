import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Exactly one trigger shape per row: facet/priceType threshold, or per-product promo, never both.
// Gift-type `percent` is an int column, so it only approximates a free gift (GIFT_TYPE_PERCENT).
export type DiscountRuleOperationKind =
    | 'percent-discount'
    | 'gift-one-from-list'
    | 'gift-all-from-list';

// Third exclusive trigger shape: recipientType/recipientErpId set, other trigger fields null.
// Never combined with the other two shapes on one row.
export type DiscountRuleRecipientType = 'counterparty' | 'contract';
export type DiscountRuleCondition = 'byQuantity' | 'byDocumentAmount';

@Entity()
@Index(['erpId'], { unique: true })
// Serves the counterparty-rule conflict lookup (single and batch path).
@Index('IDX_discount_rule_active_recipient', ['recipientType', 'recipientErpId'], {
    where: '"active" = true',
})
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

    // Nullable only for the counterparty/contract shape (null = no expiry) — see #108 in docs/ai/erp-streams-map.md.
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

    // Mirrors the event's raw string (closed 2-value set), not a proto enum.
    @Column({ type: 'varchar', nullable: true })
    recipientType!: DiscountRuleRecipientType | null;

    // Raw ERP id, deliberately not resolved to a local entity id (same as triggerProductErpId).
    @Column({ type: 'varchar', nullable: true })
    recipientErpId!: string | null;

    // Null means all nomenclature for this recipient; not the same as triggerProductErpId.
    @Column({ type: 'varchar', nullable: true })
    productErpId!: string | null;

    // "byQuantity" or "byDocumentAmount" — see CounterpartyDiscountRuleService.getBestPercent for
    // how each is evaluated against order context.
    @Column({ type: 'varchar', nullable: true })
    condition!: DiscountRuleCondition | null;

    @Column({ type: 'float', nullable: true })
    conditionValue!: number | null;

    // Captured from the event but deliberately not enforced yet — see issue #108's own comment on
    // financial guardrails being a separate, later scope. Null for the other two trigger shapes.
    @Column({ type: 'float', nullable: true })
    limitAmount!: number | null;

    // Event version decides which conflicting rule is newer, regardless of Kafka delivery order.
    @Column({ type: 'varchar', nullable: true })
    sourceVersion!: string | null;

    // Deactivated, never deleted, to keep audit trail; the other shapes rely on validFrom/validTo only.
    // Superseded rows are excluded from getBestPercent.
    @Column({ type: 'boolean', default: true })
    active!: boolean;
}
