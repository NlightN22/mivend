import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
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

    @Column({ type: 'varchar' })
    discountRuleId!: string;

    @Column({ type: 'varchar' })
    scopeType!: DiscountGrantScopeType;

    @Column({ type: 'timestamp' })
    validTo!: Date;

    @Column({ type: 'varchar' })
    sourceApprovalRequestId!: string;

    // Copied from the source ApprovalRequest's payload at materialization time (see
    // DiscountGrantService.decideAndApply) — kept as its own column rather than re-parsed from
    // ApprovalRequest.payload (plain text, not jsonb) on every /discounts read. Nullable: rows
    // created before this column existed have no value — `synchronize` cannot backfill a NOT
    // NULL column on an existing table with rows, and there's no real justification to recover
    // for those anyway.
    @Column({ type: 'varchar', nullable: true })
    justification!: string | null;

    @ManyToMany(() => Counterparty)
    @JoinTable({ name: 'discount_grant_counterparty' })
    counterparties!: Counterparty[];
}
