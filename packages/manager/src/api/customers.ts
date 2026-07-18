import { adminApi } from './client';

export interface ContactPersonInfo {
    name: string;
    phone: string | null;
    email: string | null;
    isPrimary: boolean;
}

export interface TradingPointInfo {
    id: string;
    name: string;
    address: string;
    workingHours: string | null;
    deliveryComment: string | null;
    isActive: boolean;
    contacts: ContactPersonInfo[];
}

export interface CustomerListItem {
    id: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    isActive: boolean;
    priceType: string;
    assignedManagerId: string | null;
    branchId: string | null;
    erpGroupLabel: string | null;
    contacts: ContactPersonInfo[];
    tradingPoints: TradingPointInfo[];
}

export interface CustomersListOptions {
    take?: number;
    skip?: number;
    search?: string;
    status?: 'active' | 'inactive';
    managerId?: string;
    branchId?: string;
    // Free-text, exact match against the ERP-sourced group/segment label — see
    // Counterparty.erpGroupLabel's doc comment for why this isn't a fixed enum/dropdown.
    groupLabel?: string;
    // Overrides managerId — see CounterpartyService.findVisiblePage's doc comment.
    unassignedOnly?: boolean;
}

const CUSTOMER_LIST_FIELDS = `
    id
    shortName
    legalName
    inn
    isActive
    priceType
    assignedManagerId
    branchId
    erpGroupLabel
    tradingPoints {
        id
        name
        address
        workingHours
        deliveryComment
        isActive
        contacts { name phone email isPrimary }
    }
`;

function toCustomerListItem(c: {
    id: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    isActive: boolean;
    priceType: string;
    assignedManagerId: string | null;
    branchId: string | null;
    erpGroupLabel: string | null;
    tradingPoints: TradingPointInfo[];
}): CustomerListItem {
    return {
        id: c.id,
        shortName: c.shortName,
        legalName: c.legalName,
        inn: c.inn,
        isActive: c.isActive,
        priceType: c.priceType,
        assignedManagerId: c.assignedManagerId,
        branchId: c.branchId,
        erpGroupLabel: c.erpGroupLabel,
        contacts: c.tradingPoints.flatMap(tp => tp.contacts),
        tradingPoints: c.tradingPoints,
    };
}

// Server-side paginated (see issue #39) — search/status/manager/branch/group/unassigned are all
// pushed down to CounterpartyListOptions, never filtered client-side over a partial page.
export async function fetchCustomersPage(
    options: CustomersListOptions,
): Promise<{ items: CustomerListItem[]; totalItems: number }> {
    const result = await adminApi<{
        counterparties: {
            items: Parameters<typeof toCustomerListItem>[0][];
            totalItems: number;
        };
    }>(
        `query CustomersPage($options: CounterpartyListOptions) {
            counterparties(options: $options) {
                items { ${CUSTOMER_LIST_FIELDS} }
                totalItems
            }
        }`,
        { options },
    );
    return {
        items: result.counterparties.items.map(toCustomerListItem),
        totalItems: result.counterparties.totalItems,
    };
}

export async function fetchUnassignedCounterpartyCount(): Promise<number> {
    const result = await adminApi<{ unassignedCounterpartyCount: number }>(
        `query UnassignedCounterpartyCount { unassignedCounterpartyCount }`,
    );
    return result.unassignedCounterpartyCount;
}

export interface CustomersSummary {
    totalCount: number;
    activeCount: number;
    // Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary.
    totalCreditBalance: number | null;
    highUsageCount: number | null;
}

export async function fetchCustomersSummary(): Promise<CustomersSummary> {
    const result = await adminApi<{ counterpartySummary: CustomersSummary }>(
        `query CustomersSummary {
            counterpartySummary { totalCount activeCount totalCreditBalance highUsageCount }
        }`,
    );
    return result.counterpartySummary;
}

export interface HighUsageCustomer extends CustomerListItem {
    creditLimit: number;
    creditBalance: number;
}

// Includes creditLimit/creditBalance inline — unlike the main list, this is already its own
// isolated request (small, ReadCounterpartyCredit-gated, top-N only), so it doesn't risk nulling
// out unrelated page data the way sharing a request with the main list would (see
// fetchCreditByCounterpartyId's comment). Wrapped in try/catch for callers without the permission.
export async function fetchHighUsageCustomers(limit: number): Promise<HighUsageCustomer[]> {
    try {
        const result = await adminApi<{
            highUsageCounterparties: (Parameters<typeof toCustomerListItem>[0] & {
                creditLimit: number;
                creditBalance: number;
            })[];
        }>(
            `query($limit: Int!) {
                highUsageCounterparties(limit: $limit) { ${CUSTOMER_LIST_FIELDS} creditLimit creditBalance }
            }`,
            { limit },
        );
        return result.highUsageCounterparties.map(c => ({
            ...toCustomerListItem(c),
            creditLimit: c.creditLimit,
            creditBalance: c.creditBalance,
        }));
    } catch {
        return [];
    }
}

// Bounded stopgap for callers that need a name-lookup/picker over "all" customers (discount
// grant form, discounts-page name join) rather than a paginated display list — same accepted
// pattern as `visibleOrders(options: { take: 500 })` elsewhere in this codebase (see
// api/orders.ts's fetchLastOrderDatesByCounterpartyId). Not a true fix for issue #39's concern
// (still silently truncates past 500), but replaces a literal fetch-everything call with an
// explicit bound; a real fix would need a search-as-you-type picker querying `counterparties`
// with `search`, not a full list.
export async function fetchAllCustomersCapped(): Promise<CustomerListItem[]> {
    const { items } = await fetchCustomersPage({ take: 500 });
    return items;
}

// Dedicated single-entity lookup (see counterparty.resolver.ts's `counterparty(id)`) — no longer
// depends on fetching the (now paginated) full list and filtering client-side by id.
export async function fetchCustomerById(counterpartyId: string): Promise<CustomerListItem | null> {
    const result = await adminApi<{
        counterparty: Parameters<typeof toCustomerListItem>[0] | null;
    }>(
        `query CustomerById($id: ID!) {
            counterparty(id: $id) { ${CUSTOMER_LIST_FIELDS} }
        }`,
        { id: counterpartyId },
    );
    return result.counterparty ? toCustomerListItem(result.counterparty) : null;
}

// Lightweight name-only lookup for rendering a "Customer" column against a bounded set of ids
// (one page of Invoices/Payments, never the full counterparty table) — shared by
// pages/invoices/InvoicesPage.vue and pages/payments/PaymentsPage.vue instead of each
// duplicating this fetch-per-id pattern (mirrors OrdersTable's managerName/branchName lookup
// shape, but resolved per-page here since counterparties aren't a small preloadable set).
export async function fetchCounterpartyNames(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)];
    const results = await Promise.all(
        uniqueIds.map(id =>
            adminApi<{ counterparty: { shortName: string } | null }>(
                `query($id: ID!) { counterparty(id: $id) { shortName } }`,
                { id },
            ),
        ),
    );
    return new Map(
        uniqueIds
            .map((id, i) => [id, results[i].counterparty?.shortName] as const)
            .filter((entry): entry is [string, string] => !!entry[1]),
    );
}

// Gated on CustomPermission.ReassignCounterpartyManager (department-head within their own
// department, portal-admin unrestricted) — throws for any other caller, see
// CounterpartyService.reassignManager.
export async function reassignCounterpartyManager(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(
        `mutation($counterpartyId: ID!, $administratorId: ID!) {
            reassignCounterpartyManager(counterpartyId: $counterpartyId, administratorId: $administratorId) { id }
        }`,
        { counterpartyId, administratorId },
    );
}

export interface TradingPointDetailsPatch {
    name?: string;
    address?: string;
    workingHours?: string | null;
    deliveryComment?: string | null;
    contacts?: {
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }[];
}

// Staff patch, distinct from ERP sync — gated on "can see this counterparty" (see
// TradingPointAdminResolver.updateTradingPointDetails). Every successful call is recorded by
// VersioningService for the customer's History tab.
export async function updateTradingPointDetails(
    id: string,
    input: TradingPointDetailsPatch,
): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $input: TradingPointDetailsInput!) {
            updateTradingPointDetails(id: $id, input: $input) { id }
        }`,
        { id, input },
    );
}

// One-click reactivate/deactivate — sets both isActive and customerStatus together (see
// TradingPointService.setActive).
export async function setTradingPointActive(id: string, isActive: boolean): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $isActive: Boolean!) {
            setTradingPointActive(id: $id, isActive: $isActive) { id }
        }`,
        { id, isActive },
    );
}

// Vendure's Customer.id (needed to filter orders/create draft orders) is a different id than
// the Counterparty.id this whole page is keyed by — see CounterpartyService.getForCustomer for
// the reverse direction of this same lookup.
export async function fetchCustomerIdForCounterparty(
    counterpartyId: string,
): Promise<string | null> {
    const result = await adminApi<{
        customers: { items: { id: string; counterparty: { id: string } | null }[] };
    }>(
        `query CustomersLookup { customers(options: { take: 200 }) { items { id counterparty { id } } } }`,
    );
    return result.customers.items.find(c => c.counterparty?.id === counterpartyId)?.id ?? null;
}

export interface CustomerOrderItem {
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
}

export async function fetchOrdersForCustomer(
    customerId: string,
    take = 20,
): Promise<CustomerOrderItem[]> {
    const result = await adminApi<{
        visibleOrders: { items: CustomerOrderItem[] };
    }>(
        `query CustomerOrders($customerId: ID!, $take: Int!) {
            visibleOrders(options: { take: $take, sort: { orderPlacedAt: DESC } }, customerId: $customerId) {
                items { code state totalWithTax currencyCode orderPlacedAt }
            }
        }`,
        { customerId, take },
    );
    return result.visibleOrders.items;
}

export interface CustomerDocument {
    id: string;
    type: string;
    number: string;
    status: string;
    issueDate: string;
}

export async function fetchDocumentsForCounterparty(
    counterpartyId: string,
): Promise<CustomerDocument[]> {
    const result = await adminApi<{
        documents: { items: CustomerDocument[] };
    }>(
        `query CustomerDocuments($counterpartyId: ID!) {
            documents(options: { take: 100 }, counterpartyId: $counterpartyId) {
                items { id type number status issueDate }
            }
        }`,
        { counterpartyId },
    );
    return result.documents.items;
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
}

// Isolated on purpose — see api/orderCreate.ts's fetchCustomerCredit for why creditLimit/
// creditBalance must never share a request with data the page can't do without
// (ReadCounterpartyCredit is Dept-Head/Director/SB/Portal-Admin only). Scoped to the same
// `options` as the paginated list query it's enriching (see issue #39) — this used to fetch
// credit info for every visible counterparty unbounded, which is exactly the antipattern that
// prompted the audit.
export async function fetchCreditByCounterpartyId(
    options: CustomersListOptions,
): Promise<Map<string, CustomerCredit>> {
    try {
        const result = await adminApi<{
            counterparties: { items: { id: string; creditLimit: number; creditBalance: number }[] };
        }>(
            `query($options: CounterpartyListOptions) {
                counterparties(options: $options) { items { id creditLimit creditBalance } }
            }`,
            { options },
        );
        return new Map(
            result.counterparties.items.map(c => [
                c.id,
                { creditLimit: c.creditLimit, creditBalance: c.creditBalance },
            ]),
        );
    } catch {
        return new Map();
    }
}

// Detail-page variant (Customer Detail, Order Detail) — needs credit for exactly one
// counterparty, not a page of them. Same isolation reasoning as fetchCreditByCounterpartyId.
export async function fetchCreditForCounterparty(
    counterpartyId: string,
): Promise<CustomerCredit | null> {
    try {
        const result = await adminApi<{
            counterparty: { creditLimit: number; creditBalance: number } | null;
        }>(
            `query($id: ID!) {
                counterparty(id: $id) { creditLimit creditBalance }
            }`,
            { id: counterpartyId },
        );
        return result.counterparty
            ? {
                  creditLimit: result.counterparty.creditLimit,
                  creditBalance: result.counterparty.creditBalance,
              }
            : null;
    } catch {
        return null;
    }
}

// Genuinely per-customer — uses discountGrantsForCounterparty (company-wide OR scoped to this
// counterparty, see DiscountGrantService.findForCounterparty), not the per-price-type
// discountRules query. The previous implementation counted discountRules by priceTypeCode and
// bound the result to every customer sharing that price type, which showed the identical number
// for every row whenever customers shared a price type (real bug, fixed here — see
// docs/ai/manager-portal-pages/04-customers-list.md's "Active discounts" column spec, which
// calls for a per-customer, click-through-to-/discounts count).
export async function fetchActiveDiscountCountsByCustomer(
    counterpartyIds: string[],
): Promise<Map<string, number>> {
    const now = Date.now();
    const entries = await Promise.all(
        [...new Set(counterpartyIds)].map(async counterpartyId => {
            const result = await adminApi<{
                discountGrantsForCounterparty: { validTo: string }[];
            }>(
                `query ActiveDiscountCountForCounterparty($counterpartyId: ID!) { discountGrantsForCounterparty(counterpartyId: $counterpartyId) { validTo } }`,
                { counterpartyId },
            );
            const activeCount = result.discountGrantsForCounterparty.filter(
                g => new Date(g.validTo).getTime() >= now,
            ).length;
            return [counterpartyId, activeCount] as const;
        }),
    );
    return new Map(entries);
}

export interface DiscountRuleItem {
    id: string;
    percent: number;
    facetValueCode: string | null;
    validTo: string;
}

// Only grants that actually apply to this counterparty (company-wide or scoped to it) — see
// DiscountGrantService.findForCounterparty. Using discountRules(priceTypeCode) here would leak
// grants scoped to a *different* customer that happens to share the same price type.
export async function fetchDiscountGrantsForCounterparty(
    counterpartyId: string,
): Promise<DiscountRuleItem[]> {
    const result = await adminApi<{ discountGrantsForCounterparty: DiscountRuleItem[] }>(
        `query CustomerDiscountGrants($counterpartyId: ID!) {
            discountGrantsForCounterparty(counterpartyId: $counterpartyId) {
                id
                percent
                facetValueCode
                validTo
            }
        }`,
        { counterpartyId },
    );
    return result.discountGrantsForCounterparty;
}

// Keyed by counterparty id (the "customer" this whole page means) — capped at 500 rows, same
// tradeoff as OrdersSummary's "total amount": there is no per-customer MAX(orderPlacedAt)
// aggregate query yet.
export async function fetchLastOrderDatesByCounterpartyId(): Promise<Map<string, string>> {
    const result = await adminApi<{
        visibleOrders: {
            items: {
                orderPlacedAt: string | null;
                customer: { counterparty: { id: string } | null } | null;
            }[];
        };
    }>(
        `query LastOrderDates {
            visibleOrders(options: { take: 500, sort: { orderPlacedAt: DESC } }) {
                items { orderPlacedAt customer { counterparty { id } } }
            }
        }`,
    );
    const map = new Map<string, string>();
    for (const item of result.visibleOrders.items) {
        const counterpartyId = item.customer?.counterparty?.id;
        if (!counterpartyId || !item.orderPlacedAt) continue;
        if (!map.has(counterpartyId)) {
            map.set(counterpartyId, item.orderPlacedAt);
        }
    }
    return map;
}
