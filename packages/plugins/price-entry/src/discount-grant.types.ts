import { ID } from '@vendure/common/lib/shared-types';

import { DiscountGrantScopeType } from './discount-grant.entity';
import { EXPIRING_SOON_DAYS } from './discount-registry.service';

// Returns only materialized DiscountGrant rows, never pending or rejected approval requests.
// So there is no pending/rejected state to filter by (unlike DiscountRegistryFilterStatus).
export type DiscountGrantFilterStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountGrantForCustomer {
    id: ID;
    number: string;
    createdAt: Date;
    facetValueCode: string | null;
    percent: number;
    validTo: Date;
    scopeType: DiscountGrantScopeType;
    // Computed server-side so the client never re-derives it with its own clock.
    // Browser time can disagree with the SQL status filter, mismatching the active filter chip.
    status: DiscountGrantFilterStatus;
}

export interface DiscountGrantsForCounterpartyOptions {
    take?: number;
    skip?: number;
    // Substring match against the grant's own number (DiscountGrant.number).
    search?: string;
    status?: DiscountGrantFilterStatus;
    // Set by the resolver from PriceTypeAccessService; never a client argument.
    allowedPriceTypeCodes?: string[];
}

export const DISCOUNT_GRANT_REQUEST_TYPE = 'discountGrantApproval';

// Mirrors findAllPaginated's SQL status logic; keep EXPIRING_SOON_DAYS shared.
// Pass the same `now` as the SQL filter; a default Date.now() can flip the status between them.
export function computeGrantStatus(
    validTo: Date,
    now: Date = new Date(),
): DiscountGrantFilterStatus {
    if (validTo.getTime() < now.getTime()) return 'expired';
    const soon = now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
    if (validTo.getTime() < soon) return 'expiring-soon';
    return 'active';
}

// A grant is hidden when its rule belongs to a price type the viewer cannot see.
export const RULE_PRICE_TYPE_ALLOWED_SQL = `(grant.discountRuleId IN (
    SELECT dr.id::varchar FROM discount_rule dr
    WHERE dr."priceTypeCode" IS NULL OR dr."priceTypeCode" IN (:...allowedPriceTypeCodes)))`;

export interface DiscountGrantInput {
    priceTypeCode: string;
    facetCode?: string | null;
    facetValueCode?: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    minWeightKg?: number | null;
    minAmount?: number | null;
    justification: string;
    // Links a renewal to the DiscountRule it extends — the approver sees the full renewal
    // chain via this field, per docs/ai/manager-portal-concept.md §4.1.1.
    supersedesDiscountRuleId?: string | null;
    // Omitted/empty means company-wide (scopeType 'all'); otherwise scopeType 'customer'.
    // All scoped counterparties share the same validTo.
    counterpartyIds?: string[] | null;
}

export interface DiscountGrantPayload extends DiscountGrantInput {
    requestedByJustification: string;
}
