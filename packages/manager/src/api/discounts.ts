import { adminApi } from './client';
import {
    DiscountFacetsDocument,
    DiscountRegistryPageDocument,
    ExpiringDiscountGrantsDocument,
    PriceTypeCodesDocument,
    RequestDiscountGrantDocument,
} from './generated/graphql';

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

// Single list backed by DiscountRegistryEntry (CQRS read-model projection), not two tables;
// matches the design's single 'Grant registry' table.
export async function fetchDiscountRegistryPage(
    options: DiscountRegistryListOptions,
): Promise<{ items: DiscountRegistryEntryRow[]; totalItems: number }> {
    const result = await adminApi(DiscountRegistryPageDocument, { options });
    return result.discountRegistryPage as {
        items: DiscountRegistryEntryRow[];
        totalItems: number;
    };
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

// 14 days is a placeholder; keep in sync by hand with EXPIRING_SOON_DAYS (backend, SQL-side copy).
// Display-only: the backend does not filter by it when browsing 'All statuses'.
const EXPIRING_SOON_DAYS = 14;

function materializedStatus(validTo: string): 'active' | 'expiring-soon' | 'expired' {
    const now = Date.now();
    const validToMs = new Date(validTo).getTime();
    if (validToMs < now) return 'expired';
    if (validToMs - now < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiring-soon';
    return 'active';
}

// Portal rules' erpId is portal-${approvalRequestId} (DiscountGrantService.decideAndApply).
// ERP-pushed rules lack approvalRequestId, so ruleErpId stays null (not portal-renewable).
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
    const result = await adminApi(PriceTypeCodesDocument);
    return result.priceTypeCodes;
}

export interface FacetOption {
    code: string;
    name: string;
    values: { code: string; name: string }[];
}

export async function fetchFacets(): Promise<FacetOption[]> {
    const result = await adminApi(DiscountFacetsDocument);
    return result.facets.items;
}

export async function requestDiscountGrant(input: DiscountGrantInput): Promise<{ id: string }> {
    const result = await adminApi(RequestDiscountGrantDocument, { input });
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
    const result = await adminApi(ExpiringDiscountGrantsDocument, { withinDays });
    return result.expiringDiscountGrants;
}
