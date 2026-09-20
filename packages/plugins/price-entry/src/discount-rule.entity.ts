import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Issue #107: 1C's `PromoRuleChanged` (company.customers.events.v1) feeds this same entity
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

    @Column({ type: 'timestamp' })
    validTo!: Date;

    @Column({ type: 'float', nullable: true })
    minWeightKg!: number | null;

    // Base price (in the smallest currency unit, e.g. kopecks) that must be spent on
    // this rule's facet within the order to reach this tier. Mutually exclusive with
    // minWeightKg — a rule uses one metric or the other, never both.
    @Column({ type: 'bigint', nullable: true })
    minAmount!: number | null;

    // Issue #107 — see this class's own doc comment above for the two-trigger-shape invariant.
    // 1C product id (Product.customFields.externalid) that must be present in the order at
    // >= triggerQuantity for this rule to qualify. Null for a facet/priceType-threshold rule.
    @Column({ type: 'varchar', nullable: true })
    triggerProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    triggerQuantity!: number | null;

    // 1C product id of the free/near-free gift product. Null for a percent-type promo rule
    // (percent applies to the trigger product's own line instead) and always null for a
    // facet/priceType-threshold rule.
    @Column({ type: 'varchar', nullable: true })
    giftProductErpId!: string | null;

    @Column({ type: 'float', nullable: true })
    giftQuantity!: number | null;

    // Raw 1C operation_kind, translated to the closed union by promo-rule.handler.ts before
    // storage — never the raw 1C string (ВсеПодаркиИзСписка/etc). Null for a facet/priceType-
    // threshold rule.
    @Column({ type: 'varchar', nullable: true })
    operationKind!: DiscountRuleOperationKind | null;
}
