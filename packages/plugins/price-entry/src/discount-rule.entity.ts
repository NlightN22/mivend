import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Issue #107: the ERP's `PromoRuleChanged` (company.customers.events.v1) feeds this same entity
// instead of a separate promo mechanism. Two mutually exclusive trigger shapes now exist here —
// never combined on one row:
//   1. Facet/priceType-threshold rule (the original shape): priceTypeCode set, facetCode/
//      facetValueCode/minWeightKg/minAmount describe the trigger, triggerProductErpId/
//      giftProductErpId are null.
//   2. Per-product promo rule (issue #107): triggerProductErpId/triggerQuantity set,
//      facetCode/facetValueCode/minWeightKg/minAmount/priceTypeCode are null (a promo rule
//      carries no price-type scoping in the contract — it applies regardless of the customer's
//      price type). operationKind distinguishes percent-type (giftProductErpId null, `percent`
//      applies to the trigger product's own line) from gift-type (giftProductErpId/giftQuantity
//      set, `percent` applies to the gift product's line — see GIFT_TYPE_PERCENT in
//      promo-rule.handler.ts for why an int percent column only approximates "give it away for a
//      kopeck").
export type DiscountRuleOperationKind =
    | 'percent-discount'
    | 'gift-one-from-list'
    | 'gift-all-from-list';

// Issue #108: the ERP's `DiscountRuleChanged` (company.customers.events.v1) feeds this same
// entity as a third, mutually-exclusive trigger shape — never combined with the two above on one
// row: recipientType/recipientErpId set, facetCode/facetValueCode/priceTypeCode/
// triggerProductErpId/giftProductErpId/operationKind null. See CounterpartyDiscountRuleService.
export type DiscountRuleRecipientType = 'counterparty' | 'contract';
export type DiscountRuleCondition = 'byQuantity' | 'byDocumentAmount';

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

    // Nullable only for the counterparty/contract shape (null = no expiry) — see #108 in docs/ai/erp-streams-map.md.
    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    @Column({ type: 'float', nullable: true })
    minWeightKg!: number | null;

    // Base price (in the smallest currency unit, e.g. kopecks) that must be spent on
    // this rule's facet within the order to reach this tier. Mutually exclusive with
    // minWeightKg — a rule uses one metric or the other, never both.
    @Column({ type: 'bigint', nullable: true })
    minAmount!: number | null;

    // Issue #107 — see this class's own doc comment above for the two-trigger-shape invariant.
    // ERP product id (Product.customFields.externalid) that must be present in the order at
    // >= triggerQuantity for this rule to qualify. Null for a facet/priceType-threshold rule.
    @Column({ type: 'varchar', nullable: true })
    triggerProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    triggerQuantity!: number | null;

    // ERP product id of the free/near-free gift product. Null for a percent-type promo rule
    // (percent applies to the trigger product's own line instead) and always null for a
    // facet/priceType-threshold rule.
    @Column({ type: 'varchar', nullable: true })
    giftProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    giftQuantity!: number | null;

    // Raw ERP operation_kind, translated to the closed union by promo-rule.handler.ts before
    // storage — never the raw ERP string (ВсеПодаркиИзСписка/etc). Null for a facet/priceType-
    // threshold rule.
    @Column({ type: 'varchar', nullable: true })
    operationKind!: DiscountRuleOperationKind | null;

    // Issue #108 — see this class's own doc comment above for the three-trigger-shape invariant.
    // "counterparty" or "contract" — mirrors the event's own raw string (closed 2-value set),
    // never a proto enum. Null for the other two trigger shapes.
    @Column({ type: 'varchar', nullable: true })
    recipientType!: DiscountRuleRecipientType | null;

    // Raw ERP id of the counterparty or contract (per recipientType) this rule targets — never
    // resolved to a local entity id, same "keep the raw ERP id" convention as
    // triggerProductErpId. Null for the other two trigger shapes.
    @Column({ type: 'varchar', nullable: true })
    recipientErpId!: string | null;

    // ERP product id (Product.customFields.externalid) this rule is scoped to. Null means "applies
    // to all nomenclature for this recipient" (the event's own documented null semantics) — never
    // confused with triggerProductErpId (issue #107's unrelated promo-rule trigger).
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

    // The ERP event's own `version` (plain string, see IntegrationInboxEvent's own column
    // comment in plugin-erp-integration) — used by CounterpartyDiscountRuleService to decide which
    // of two conflicting rules is newer, independent of Kafka delivery/receipt order. Null for the
    // other two trigger shapes.
    @Column({ type: 'varchar', nullable: true })
    sourceVersion!: string | null;

    // Conflict-prevention flag (issue #108): a superseded counterparty/contract-scoped rule is
    // deactivated, never deleted (kept for audit/reconciliation with #101), and excluded from
    // getBestPercent. The other two trigger shapes never set this false — their own validFrom/
    // validTo window is the only activity gate they use.
    @Column({ type: 'boolean', default: true })
    active!: boolean;
}
