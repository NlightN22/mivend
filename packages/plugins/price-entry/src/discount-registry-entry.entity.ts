import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type DiscountRegistryStatus = 'pending' | 'rejected' | 'materialized';

// Read model for /discounts list only; synced by DiscountRegistryService, never written alone.
// Not a source of truth: pricing reads DiscountRule, grant applicability reads DiscountGrant.
@Entity()
export class DiscountRegistryEntry extends VendureEntity {
    constructor(input?: DeepPartial<DiscountRegistryEntry>) {
        super(input);
    }

    // Stable for the entry's lifecycle: the request link never changes after approval.
    // Null for ERP-pushed rules (no request, start 'materialized'); one id is always set.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    approvalRequestId!: string | null;

    // Set once the request is approved and a DiscountRule is materialized (portal-origin), or
    // immediately for ERP-pushed rules (see approvalRequestId doc above).
    @Index()
    @Column({ type: 'varchar', nullable: true })
    discountRuleId!: string | null;

    // active/expiring-soon/expired are derived from validTo at query time, not stored.
    // So no background job is needed to keep them correct as time passes.
    @Column({ type: 'varchar' })
    status!: DiscountRegistryStatus;

    @Column({ type: 'varchar' })
    priceTypeCode!: string;

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

    @Column({ type: 'varchar', nullable: true })
    justification!: string | null;

    // Denormalized copy of counterpartyIds so the list can resolve names without a per-row query.
    // Source of truth stays in DiscountGrant / ApprovalRequest payload; null means company-wide.
    @Column({ type: 'simple-json', nullable: true })
    counterpartyIds!: string[] | null;

    // Search-only snapshot of names, so search can ILIKE this table without joining Counterparty.
    // Accepted staleness after renames; UI display names are always resolved live, never from here.
    @Column({ type: 'varchar', nullable: true })
    customerNamesForSearch!: string | null;
}
