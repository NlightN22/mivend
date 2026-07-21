import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';

export type DiscountGrantScopeType = 'all' | 'customer';

// Materialized once a discountGrantApproval request is approved — see
// DiscountGrantService.decideAndApply. Tracks which customers a discount applies to, on top of
// the price-type/facet policy already captured by DiscountRule. scopeType 'all' means no
// counterparties are attached (company-wide, same as before this entity existed); 'customer'
// means the discount applies only to the attached counterparties, all sharing the same validTo
// (per docs/ai/manager-portal-concept.md discussion — a per-customer grant list always shares one
// expiry, there is no need for per-customer overrides).
@Entity()
export class DiscountGrant extends VendureEntity {
    constructor(input?: DeepPartial<DiscountGrant>) {
        super(input);
    }

    // The grant's own human-facing business number — generated at creation
    // (DiscountGrantService.decideAndApply), since a discount grant has no external-system
    // reference to reuse (it's always portal-created, approval-workflow-driven — never ERP-
    // pushed, unlike DiscountRule.erpId). Same generation principle as Order.code
    // (apps/server/src/order-code.strategy.ts) via shared/src/documentCode.ts's
    // generateDocumentCode.
    @Index()
    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'varchar' })
    discountRuleId!: string;

    @Column({ type: 'varchar' })
    scopeType!: DiscountGrantScopeType;

    @Column({ type: 'timestamp' })
    validTo!: Date;

    @Column({ type: 'varchar' })
    sourceApprovalRequestId!: string;

    @ManyToMany(() => Counterparty)
    @JoinTable({ name: 'discount_grant_counterparty' })
    counterparties!: Counterparty[];
}
