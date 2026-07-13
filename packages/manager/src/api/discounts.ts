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

// discountGrantApproval requests, any status — DiscountRule rows only exist once approved (see
// DiscountGrantService.decideAndApply), so this is the only source for "Pending approval" /
// "Rejected" rows in the list (docs/ai/manager-portal-pages/09-discounts.md).
export async function fetchDiscountGrantRequests(): Promise<DiscountGrantRequestRow[]> {
    const result = await adminApi<{ approvalRequestsByType: DiscountGrantRequestRow[] }>(
        `query {
            approvalRequestsByType(requestType: "discountGrantApproval") {
                id
                status
                payload
                createdAt
                decidedAt
            }
        }`,
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
    counterparties: { id: string; legalName: string }[];
}

export async function fetchAllDiscountGrants(): Promise<DiscountGrantRow[]> {
    const result = await adminApi<{ discountGrants: DiscountGrantRow[] }>(
        `query {
            discountGrants {
                id
                discountRuleId
                scopeType
                counterparties { id legalName }
            }
        }`,
    );
    return result.discountGrants;
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

// Merges three real sources this list draws from: DiscountRule (materialized once a grant is
// approved), discountGrantApproval ApprovalRequests (the only place "Pending approval" /
// "Rejected" rows — and the original justification, which DiscountRule doesn't store — come
// from), and DiscountGrant (the only place the actual customer(s) a grant applies to come
// from — see DiscountGrantService.decideAndApply). A portal-created rule's erpId is always
// `portal-${requestId}` (how rule <-> request are cross-referenced); DiscountGrant.discountRuleId
// is the rule's internal id (how rule <-> grant are cross-referenced).
export function buildDiscountRows(
    rules: DiscountRuleRow[],
    requests: DiscountGrantRequestRow[],
    grants: DiscountGrantRow[],
    counterpartyNamesById: Map<string, string>,
): DiscountRow[] {
    const approvedByErpId = new Map<
        string,
        { row: DiscountGrantRequestRow; payload: DiscountGrantPayload }
    >();
    for (const request of requests) {
        if (request.status !== 'approved') continue;
        try {
            const payload = JSON.parse(request.payload) as DiscountGrantPayload;
            approvedByErpId.set(`portal-${request.id}`, { row: request, payload });
        } catch {
            // malformed payload — this request just won't contribute a justification/link
        }
    }

    const grantByRuleId = new Map(grants.map(g => [g.discountRuleId, g]));

    const ruleRows: DiscountRow[] = rules.map(rule => {
        const matched = approvedByErpId.get(rule.erpId);
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
            justification: matched?.payload.justification ?? null,
            ruleErpId: rule.erpId,
            approvalRequestId: matched?.row.id ?? null,
        };
    });

    const pendingOrRejectedRows: DiscountRow[] = requests
        .filter(r => r.status === 'pending' || r.status === 'rejected')
        .map(request => {
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

    return [...ruleRows, ...pendingOrRejectedRows].sort(
        (a, b) => new Date(b.validTo).getTime() - new Date(a.validTo).getTime(),
    );
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
