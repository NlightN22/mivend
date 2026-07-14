import { adminApi } from './client';

export interface DiscountRuleRow {
    id: string;
    erpId: string;
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
}

export async function fetchAllDiscountRules(): Promise<DiscountRuleRow[]> {
    const result = await adminApi<{ discountRules: DiscountRuleRow[] }>(
        `query {
            discountRules {
                id
                erpId
                priceTypeCode
                facetCode
                facetValueCode
                percent
                validFrom
                validTo
            }
        }`,
    );
    return result.discountRules;
}

export type DiscountRuleFilterStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountRuleListOptions {
    take?: number;
    skip?: number;
    search?: string;
    priceTypeCode?: string;
    status?: DiscountRuleFilterStatus;
}

// Real server-side pagination + filtering for the /discounts registry's materialized-grants
// section (issue #39) — see DiscountRuleService.findAllPaginated on the backend.
export async function fetchDiscountRulesPage(
    options: DiscountRuleListOptions,
): Promise<{ items: DiscountRuleRow[]; totalItems: number }> {
    const result = await adminApi<{
        discountRulesPage: { items: DiscountRuleRow[]; totalItems: number };
    }>(
        `query($options: DiscountRuleListOptions) {
            discountRulesPage(options: $options) {
                items {
                    id
                    erpId
                    priceTypeCode
                    facetCode
                    facetValueCode
                    percent
                    validFrom
                    validTo
                }
                totalItems
            }
        }`,
        { options },
    );
    return result.discountRulesPage;
}

export interface DiscountGrantPayload {
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    justification: string;
    supersedesDiscountRuleId: string | null;
    counterpartyIds: string[] | null;
}

export interface DiscountGrantRequestRow {
    id: string;
    status: string;
    payload: string;
    createdAt: string;
    decidedAt: string | null;
}

export interface DiscountRequestListOptions {
    take?: number;
    skip?: number;
    search?: string;
    statuses?: string[];
}

// discountGrantApproval requests — DiscountRule rows only exist once approved (see
// DiscountGrantService.decideAndApply), so this is the only source for "Pending approval" /
// "Rejected" rows (docs/ai/manager-portal-pages/09-discounts.md). Real server-side pagination
// (issue #39) — `search` only matches the request id server-side (same documented limitation as
// Approvals' own search, see ApprovalListOptions), since the customer/price-type/facet fields
// live inside the request's plain-text payload, not a queryable column.
export async function fetchDiscountRequestsPage(
    options: DiscountRequestListOptions,
): Promise<{ items: DiscountGrantRequestRow[]; totalItems: number }> {
    const result = await adminApi<{
        approvalRequestsByType: { items: DiscountGrantRequestRow[]; totalItems: number };
    }>(
        `query($options: ApprovalListOptions) {
            approvalRequestsByType(requestType: "discountGrantApproval", options: $options) {
                items { id status payload createdAt decidedAt }
                totalItems
            }
        }`,
        { options },
    );
    return result.approvalRequestsByType;
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

export type DiscountRowStatus = 'active' | 'expiring-soon' | 'expired' | 'pending' | 'rejected';

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

export interface DiscountGrantRow {
    id: string;
    discountRuleId: string;
    scopeType: string;
    justification: string | null;
    counterparties: { id: string; legalName: string }[];
}

// Scoped to exactly the rule ids on the current paginated page (issue #39) — the real,
// bounded-by-construction replacement for the old fetchAllDiscountGrants (unbounded, capped at
// 200 as an interim stopgap).
export async function fetchDiscountGrantsForRuleIds(
    ruleIds: string[],
): Promise<DiscountGrantRow[]> {
    if (ruleIds.length === 0) return [];
    const result = await adminApi<{ discountGrantsForRuleIds: DiscountGrantRow[] }>(
        `query($ruleIds: [ID!]!) {
            discountGrantsForRuleIds(ruleIds: $ruleIds) {
                id
                discountRuleId
                scopeType
                justification
                counterparties { id legalName }
            }
        }`,
        { ruleIds },
    );
    return result.discountGrantsForRuleIds;
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
// decided; 14 days is the same placeholder used on Dashboard/Customers.
const EXPIRING_SOON_DAYS = 14;

function ruleStatus(validTo: string): 'active' | 'expiring-soon' | 'expired' {
    const now = Date.now();
    const validToMs = new Date(validTo).getTime();
    if (validToMs < now) return 'expired';
    if (validToMs - now < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiring-soon';
    return 'active';
}

// Materialized grants (DiscountRule + its DiscountGrant, once a request is approved — see
// DiscountGrantService.decideAndApply). A portal-created rule's erpId is always
// `portal-${requestId}`, which is how the row links back to its approval request without a
// second fetch. DiscountGrant now carries `justification` directly (copied at materialization
// time) — no need to re-parse the source ApprovalRequest's payload just to display it.
export function buildMaterializedRows(
    rules: DiscountRuleRow[],
    grants: DiscountGrantRow[],
): DiscountRow[] {
    const grantByRuleId = new Map(grants.map(g => [g.discountRuleId, g]));

    return rules.map(rule => {
        const grant = grantByRuleId.get(rule.id);
        const customer = grant
            ? grant.scopeType === 'all'
                ? ALL_CUSTOMERS_LABEL
                : grant.counterparties.map(c => c.legalName).join(', ') || ALL_CUSTOMERS_LABEL
            : ALL_CUSTOMERS_LABEL;
        return {
            key: `rule-${rule.id}`,
            customer,
            priceType: rule.priceTypeCode,
            facet: rule.facetValueCode ?? 'All products',
            percent: rule.percent,
            validFrom: rule.validFrom,
            validTo: rule.validTo,
            status: ruleStatus(rule.validTo),
            justification: grant?.justification ?? null,
            ruleErpId: rule.erpId,
            approvalRequestId: rule.erpId.startsWith('portal-') ? rule.erpId.slice(7) : null,
        };
    });
}

// Pending/rejected discountGrantApproval requests — the only source for these rows, since
// DiscountRule only exists once a request is approved.
export function buildRequestRows(
    requests: DiscountGrantRequestRow[],
    counterpartyNamesById: Map<string, string>,
): DiscountRow[] {
    return requests.map(request => {
        let payload: DiscountGrantPayload | null = null;
        try {
            payload = JSON.parse(request.payload) as DiscountGrantPayload;
        } catch {
            payload = null;
        }
        return {
            key: `request-${request.id}`,
            customer: customerLabel(payload?.counterpartyIds, counterpartyNamesById),
            priceType: payload?.priceTypeCode ?? '—',
            facet: payload?.facetValueCode ?? 'All products',
            percent: payload?.percent ?? 0,
            validFrom: payload?.validFrom ?? request.createdAt,
            validTo: payload?.validTo ?? request.createdAt,
            status: request.status as 'pending' | 'rejected',
            justification: payload?.justification ?? null,
            ruleErpId: null,
            approvalRequestId: request.id,
        };
    });
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
