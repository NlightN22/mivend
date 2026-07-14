import { adminApi } from './client';

export type DiscountRegistryFilterStatus =
    | 'active'
    | 'expiring-soon'
    | 'expired'
    | 'pending'
    | 'rejected';

export interface DiscountRegistryListOptions {
    take?: number;
    skip?: number;
    search?: string;
    priceTypeCode?: string;
    status?: DiscountRegistryFilterStatus;
}

export interface DiscountRegistryEntryRow {
    id: string;
    // Null for DiscountRule rows that were never approval-driven (ERP-pushed) — see
    // DiscountRegistryEntry's doc comment on the backend.
    approvalRequestId: string | null;
    discountRuleId: string | null;
    status: 'pending' | 'rejected' | 'materialized';
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    justification: string | null;
    counterpartyIds: string[] | null;
}

// Real single-source server-side pagination + filtering for the /discounts registry (issue #39
// follow-up) — one unified list backed by DiscountRegistryEntry (a CQRS-style read-model
// projection, see DiscountRegistryService on the backend), matching the design concept's single
// "Grant registry" table instead of the earlier two-table split.
export async function fetchDiscountRegistryPage(
    options: DiscountRegistryListOptions,
): Promise<{ items: DiscountRegistryEntryRow[]; totalItems: number }> {
    const result = await adminApi<{
        discountRegistryPage: { items: DiscountRegistryEntryRow[]; totalItems: number };
    }>(
        `query($options: DiscountRegistryListOptions) {
            discountRegistryPage(options: $options) {
                items {
                    id
                    approvalRequestId
                    discountRuleId
                    status
                    priceTypeCode
                    facetCode
                    facetValueCode
                    percent
                    validFrom
                    validTo
                    justification
                    counterpartyIds
                }
                totalItems
            }
        }`,
        { options },
    );
    return result.discountRegistryPage;
}

export interface DiscountGrantInput {
    priceTypeCode: string;
    facetCode?: string | null;
    facetValueCode?: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    justification: string;
    supersedesDiscountRuleId?: string | null;
    counterpartyIds?: string[] | null;
}

export type DiscountRowStatus = DiscountRegistryFilterStatus;

export interface DiscountRow {
    key: string;
    customer: string;
    priceType: string;
    facet: string;
    percent: number;
    validFrom: string;
    validTo: string;
    status: DiscountRowStatus;
    justification: string | null;
    ruleErpId: string | null;
    approvalRequestId: string | null;
}

const ALL_CUSTOMERS_LABEL = 'All customers';

function customerLabel(
    counterpartyIds: string[] | null | undefined,
    namesById: Map<string, string>,
): string {
    if (!counterpartyIds || counterpartyIds.length === 0) return ALL_CUSTOMERS_LABEL;
    return counterpartyIds.map(id => namesById.get(id) ?? id).join(', ');
}

// See docs/ai/manager-portal-concept.md §8.2 — no exact "expiring soon" threshold has been
// decided; 14 days is the same placeholder used on Dashboard/Customers. Mirrors the backend's
// own EXPIRING_SOON_DAYS in DiscountRegistryService — kept in sync by hand, one lives in SQL,
// this one only in a purely-cosmetic status label (the backend already filtered by status when
// `status` was set; this is only used for display when browsing "All statuses").
const EXPIRING_SOON_DAYS = 14;

function materializedStatus(validTo: string): 'active' | 'expiring-soon' | 'expired' {
    const now = Date.now();
    const validToMs = new Date(validTo).getTime();
    if (validToMs < now) return 'expired';
    if (validToMs - now < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiring-soon';
    return 'active';
}

// A portal-created DiscountRule's erpId is always `portal-${approvalRequestId}` (see
// DiscountGrantService.decideAndApply) — reconstructed here instead of fetched, since
// DiscountRegistryEntry.approvalRequestId already gives us everything needed. ERP-pushed rules
// have no approvalRequestId at all — never portal-renewable, so ruleErpId stays null for them
// (the renewal form only makes sense for portal-originated grants).
export function buildDiscountRegistryRows(
    entries: DiscountRegistryEntryRow[],
    namesById: Map<string, string>,
): DiscountRow[] {
    return entries.map(entry => ({
        key: `entry-${entry.id}`,
        customer: customerLabel(entry.counterpartyIds, namesById),
        priceType: entry.priceTypeCode,
        facet: entry.facetValueCode ?? 'All products',
        percent: entry.percent,
        validFrom: entry.validFrom,
        validTo: entry.validTo,
        status: entry.status === 'materialized' ? materializedStatus(entry.validTo) : entry.status,
        justification: entry.justification,
        ruleErpId:
            entry.discountRuleId && entry.approvalRequestId
                ? `portal-${entry.approvalRequestId}`
                : null,
        approvalRequestId: entry.approvalRequestId,
    }));
}

export async function fetchPriceTypeCodes(): Promise<string[]> {
    const result = await adminApi<{ priceTypeCodes: string[] }>(`query { priceTypeCodes }`);
    return result.priceTypeCodes;
}

export interface FacetOption {
    code: string;
    name: string;
    values: { code: string; name: string }[];
}

export async function fetchFacets(): Promise<FacetOption[]> {
    const result = await adminApi<{ facets: { items: FacetOption[] } }>(
        `query { facets(options: { take: 50 }) { items { code name values { code name } } } }`,
    );
    return result.facets.items;
}

export async function requestDiscountGrant(input: DiscountGrantInput): Promise<{ id: string }> {
    const result = await adminApi<{ requestDiscountGrant: { id: string } }>(
        `mutation($input: DiscountGrantInput!) {
            requestDiscountGrant(input: $input) { id }
        }`,
        { input },
    );
    return result.requestDiscountGrant;
}

export interface ExpiringDiscountGrant {
    id: string;
    validTo: string;
    counterparties: { id: string; legalName: string }[];
}

export async function fetchExpiringDiscountGrants(
    withinDays: number,
): Promise<ExpiringDiscountGrant[]> {
    const result = await adminApi<{ expiringDiscountGrants: ExpiringDiscountGrant[] }>(
        `query($withinDays: Int!) {
            expiringDiscountGrants(withinDays: $withinDays) {
                id
                validTo
                counterparties { id legalName }
            }
        }`,
        { withinDays },
    );
    return result.expiringDiscountGrants;
}
