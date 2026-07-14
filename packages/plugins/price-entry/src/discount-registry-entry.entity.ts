import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type DiscountRegistryStatus = 'pending' | 'rejected' | 'materialized';

// CQRS-style read-model projection for the /discounts registry — one row per discount-grant
// *attempt*, tracked through its whole lifecycle, instead of the page joining two differently-
// shaped write-side sources (DiscountRule, whose rows only exist once approved, and
// ApprovalRequest, whose business fields live inside a plain-text JSON payload) at read time.
//
// Kept in sync by DiscountRegistryService, called from the same two places that already mutate
// the write-side state (DiscountGrantService.requestGrant/decideAndApply) — never written to
// independently. DiscountRule remains the source of truth for pricing (PriceResolutionService
// reads it directly, never this table) and DiscountGrant remains the source of truth for
// "which grants apply to counterparty X" (Customer Detail's Discounts tab) — this table exists
// purely to make the admin list page fast and simple to query, not to replace either.
@Entity()
export class DiscountRegistryEntry extends VendureEntity {
    constructor(input?: DeepPartial<DiscountRegistryEntry>) {
        super(input);
    }

    // Stable for the entry's whole lifecycle — the "View request" link target never changes,
    // even after the request is approved and discountRuleId gets filled in. Null for
    // DiscountRule rows that were never approval-driven (ERP-pushed via bulkUpsertDiscountRules
    // / upsertDiscountRule) — those have no request, no "View request" link, and start life
    // already 'materialized'. At least one of approvalRequestId/discountRuleId is always set.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    approvalRequestId!: string | null;

    // Set once the request is approved and a DiscountRule is materialized (portal-origin), or
    // immediately for ERP-pushed rules (see approvalRequestId doc above).
    @Index()
    @Column({ type: 'varchar', nullable: true })
    discountRuleId!: string | null;

    // 'active' / 'expiring-soon' / 'expired' are deliberately NOT stored here — those are
    // derived from validTo at query time (same threshold logic as before), so they never need
    // a background job to stay correct as time passes. This column only tracks the part of the
    // lifecycle that's driven by real events (a decision being made).
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

    // Denormalized copy of the request/grant's counterpartyIds — the source of truth for WHO
    // this applies to remains DiscountGrant.counterparties (materialized) / the ApprovalRequest
    // payload (pending/rejected); this copy exists so the registry list can resolve display
    // names without a second query per row. `null` = company-wide.
    @Column({ type: 'simple-json', nullable: true })
    counterpartyIds!: string[] | null;

    // Denormalized, search-only — a snapshot of counterparty legal/short names at write time,
    // used purely so `search` can match by customer name via a plain ILIKE on this table,
    // without joining out to Counterparty. Accepted staleness: if a counterparty is renamed
    // later, old registry entries keep matching their old name until next written — the same
    // "read model can lag the write model" tradeoff CQRS read models always make. The *display*
    // name shown in the UI is always resolved live (via namesById), never read from this column.
    @Column({ type: 'varchar', nullable: true })
    customerNamesForSearch!: string | null;
}
