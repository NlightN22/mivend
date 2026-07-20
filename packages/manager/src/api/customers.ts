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
        customers: { items: { id: string }[] };
    }>(
        // counterpartyId is a customField, filterable as a flat StringOperators field (not
        // IDOperators, even though it holds an id) — same gotcha AGENTS.md documents for Shop
        // API custom field filters being flat; here it's also typed as plain String, not ID.
        `query CustomerIdForCounterparty($counterpartyId: String!) {
            customers(options: { take: 1, filter: { counterpartyId: { eq: $counterpartyId } } }) {
                items { id }
            }
        }`,
        { counterpartyId },
    );
    return result.customers.items[0]?.id ?? null;
}

export interface CustomerOrderItem {
    id: string;
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
    createdAt: string;
    totalQuantity: number;
    customer: { firstName: string; lastName: string } | null;
    customFields: {
        // Denormalized server-side by ErpOrderService.onFulfillmentStateChanged — see
        // vendure-config.ts's doc comment. Null means no fulfillment yet ("Not started").
        latestFulfillmentState: string | null;
        // Denormalized server-side at placement time by ErpOrderService.onOrderPlaced — null
        // means a storefront customer placed it themselves (no Administrator involved). Resolve
        // to a display name via the `managers` list, same as OrdersTable.vue's managerName().
        placedByAdministratorId: string | null;
        // plugin-reservation's own state field — real column now (see CustomerOrdersDataTable.vue),
        // not an orphaned filter with no corresponding data on screen.
        reservationState: string | null;
    };
}

// totalQuantity is a real field already on Vendure's Order type —
// latestFulfillmentState/placedByAdministratorId are this project's own denormalized customFields
// (see vendure-config.ts), replacing what used to be computed client-side from `history`/the raw
// `fulfillments` relation on every request (neither is fetched at all anymore — the fulfillment
// progress bar now reads a stage position from latestFulfillmentState, not a fulfilled-quantity
// ratio computed from `fulfillments` — see CustomerOrdersTab.vue's fulfillmentProgress()).
const CUSTOMER_ORDER_ITEM_FIELDS = `
    id
    code
    state
    totalWithTax
    currencyCode
    orderPlacedAt
    createdAt
    totalQuantity
    customer { firstName lastName }
    customFields { latestFulfillmentState placedByAdministratorId reservationState }
`;

export async function fetchOrdersForCustomer(
    customerId: string,
    take = 20,
): Promise<CustomerOrderItem[]> {
    const result = await adminApi<{
        visibleOrders: { items: CustomerOrderItem[] };
    }>(
        `query CustomerOrders($customerId: ID!, $take: Int!) {
            visibleOrders(options: { take: $take, sort: { orderPlacedAt: DESC } }, customerId: $customerId) {
                items { ${CUSTOMER_ORDER_ITEM_FIELDS} }
            }
        }`,
        { customerId, take },
    );
    return result.visibleOrders.items;
}

// CustomerOrdersTab's "view chips" (All/Unpaid/Partially paid/Cancelled) — real, DB-level
// filtered + paginated per view, not a client-side filter over one loaded page (that was the
// actual bug: counts changed as you paginated) and not a full-list-in-memory fetch either (real
// memory/bandwidth cost for a customer with a large order history). "Cancelled" uses the same
// visibleOrders query with a plain state filter (already a real Order column). Unpaid/Partially
// paid go through plugin-acquiring's customerOrdersByPaymentView — a correlated SQL subquery
// against PaymentAttempt, executed with real skip/take server-side. That query lives in
// plugin-acquiring rather than here because plugin-erp-order (which owns visibleOrders) can't
// depend on plugin-acquiring's PaymentAttempt entity: plugin-acquiring already depends on
// plugin-erp-order transitively via plugin-sync, so the reverse edge would be a circular package
// dependency (confirmed via a real `tsc -b` "Project references may not form a circular graph"
// error when tried the other way around). See AdminOrderPaymentViewResolver in plugin-acquiring.
export type CustomerOrdersView = 'all' | 'unpaid' | 'partial' | 'cancelled';

// Sentinel for the Placed-by filter's "Customer (self)" option — customFields.
// placedByAdministratorId is null for an order the customer placed directly via the storefront,
// so this can't just be a real administrator id. Shared with CustomerOrdersDataTable.vue, which
// is the only other place this must match.
export const PLACED_BY_CUSTOMER_VALUE = '__customer__';

export interface CustomerOrdersExtraFilters {
    // Order.state — a different axis from `view` (payment status): a user can narrow "All" down
    // to e.g. just "Awaiting shipment" while still seeing unpaid+paid orders together. Ignored
    // when `view === 'cancelled'`, which already pins state itself. Multi-select (the Commercial
    // state column filter — see CustomerOrdersDataTable.vue), so `eq` for one value, `in` for
    // several.
    state?: string[];
    // plugin-reservation's customFields.reservationState — same field OrdersFilterBar's
    // "Reservation" filter uses on the main Orders page.
    reservationState?: string;
    // ISO dates (yyyy-mm-dd), inclusive on both ends — the `date-range` filter type in
    // CustomerOrdersDataTable.vue (presets like "Last 7 days"/"This month" plus a custom range).
    // Either can be open-ended.
    dateFrom?: string;
    dateTo?: string;
    // Order.code contains — real StringOperators filter, no denormalization needed.
    code?: string;
    // customFields.latestFulfillmentState — see vendure-config.ts's doc comment. Multi-select,
    // same reasoning as `state` above.
    fulfillmentState?: string[];
    // customFields.placedByAdministratorId — see vendure-config.ts's doc comment.
    placedByAdministratorId?: string;
    // Order.totalWithTax range, in minor currency units — real NumberOperators filter.
    totalMin?: number;
    totalMax?: number;
}

export async function fetchOrdersPageForCustomer(
    customerId: string,
    page: number,
    pageSize: number,
    view: CustomerOrdersView,
    // Object insertion order = ORDER BY clause order (Vendure's OrderSortParameter supports
    // multiple keys) — see api/orders.ts's identical OrderSortField doc comment.
    sort: Partial<
        Record<'code' | 'state' | 'totalWithTax' | 'orderPlacedAt' | 'createdAt', 'ASC' | 'DESC'>
    > = {
        createdAt: 'DESC',
    },
    extraFilters: CustomerOrdersExtraFilters = {},
): Promise<{ items: CustomerOrderItem[]; totalItems: number }> {
    const filter: Record<string, unknown> = {};
    if (view === 'cancelled') filter.state = { eq: 'Cancelled' };
    else if (extraFilters.state?.length) {
        filter.state =
            extraFilters.state.length === 1
                ? { eq: extraFilters.state[0] }
                : { in: extraFilters.state };
    }
    if (extraFilters.code) filter.code = { contains: extraFilters.code };
    if (extraFilters.dateFrom || extraFilters.dateTo) {
        // Filters on createdAt, not orderPlacedAt — matches what the "Date created" column
        // actually displays (see CustomerOrdersDataTable.vue). orderPlacedAt stays reserved for
        // KPI/overdue semantics elsewhere (dashboard.ts) where "only orders that were actually
        // placed" is the correct meaning; this column/filter is purely informational and must
        // cover every order, including ones never placed (abandoned carts, cancelled-before-
        // placement) — see seed-customer-detail.mjs's spreadOrderPlacedDates for the real incident
        // that surfaced this (orders showing "—" in this column despite genuinely existing).
        // Inclusive on both ends, local time — `before` is the day *after* dateTo's start, so a
        // range ending "today" still includes every order created today regardless of time of day.
        const createdAt: Record<string, string> = {};
        if (extraFilters.dateFrom)
            createdAt.after = new Date(`${extraFilters.dateFrom}T00:00:00`).toISOString();
        if (extraFilters.dateTo) {
            const start = new Date(`${extraFilters.dateTo}T00:00:00`);
            createdAt.before = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
        }
        filter.createdAt = createdAt;
    }
    if (extraFilters.totalMin !== undefined || extraFilters.totalMax !== undefined) {
        filter.totalWithTax = {
            ...(extraFilters.totalMin !== undefined ? { gte: extraFilters.totalMin } : {}),
            ...(extraFilters.totalMax !== undefined ? { lte: extraFilters.totalMax } : {}),
        };
    }
    // Custom fields in Shop/Admin API filters are flat, not nested under a `customFields` key —
    // see AGENTS.md's Vendure gotcha. Real incident this fixes: `filter.customFields = {...}`
    // isn't a valid `OrderFilterParameter` shape at all — every query using it (reservationState,
    // fulfillmentState, placedByAdministratorId) threw a GraphQL validation error
    // ('Field "customFields" is not defined by type "OrderFilterParameter"') on every request
    // that set any of these, so picking any value in that column's funnel filter just broke the
    // whole table (no rows, not "no matches" — a real fetch failure).
    if (extraFilters.reservationState)
        filter.reservationState = { eq: extraFilters.reservationState };
    if (extraFilters.fulfillmentState?.length) {
        // 'Not started' is this UI's synthetic label for "no fulfillment yet" — the real column
        // value is a null customField, not a literal string, so it needs `isNull` instead of
        // `eq`/`in` (see FULFILLMENT_STATE_OPTIONS in api/orders.ts). Multi-select can mix
        // 'Not started' with real values at once, which needs an `_or` across both shapes — a
        // single `in` can't express "isNull OR one of these strings".
        const hasNotStarted = extraFilters.fulfillmentState.includes('Not started');
        const realValues = extraFilters.fulfillmentState.filter(v => v !== 'Not started');
        if (hasNotStarted && realValues.length) {
            filter._or = [
                { latestFulfillmentState: { isNull: true } },
                {
                    latestFulfillmentState:
                        realValues.length === 1 ? { eq: realValues[0] } : { in: realValues },
                },
            ];
        } else if (hasNotStarted) {
            filter.latestFulfillmentState = { isNull: true };
        } else {
            filter.latestFulfillmentState =
                realValues.length === 1 ? { eq: realValues[0] } : { in: realValues };
        }
    }
    if (extraFilters.placedByAdministratorId) {
        filter.placedByAdministratorId =
            extraFilters.placedByAdministratorId === PLACED_BY_CUSTOMER_VALUE
                ? { isNull: true }
                : { eq: extraFilters.placedByAdministratorId };
    }

    const options = {
        skip: (page - 1) * pageSize,
        take: pageSize,
        sort,
        ...(Object.keys(filter).length ? { filter } : {}),
    };

    if (view === 'unpaid' || view === 'partial') {
        const result = await adminApi<{
            customerOrdersByPaymentView: { items: CustomerOrderItem[]; totalItems: number };
        }>(
            `query CustomerOrdersByPaymentView($customerId: ID!, $paymentView: String!, $options: OrderListOptions) {
                customerOrdersByPaymentView(customerId: $customerId, paymentView: $paymentView, options: $options) {
                    totalItems
                    items { ${CUSTOMER_ORDER_ITEM_FIELDS} }
                }
            }`,
            { customerId, paymentView: view, options },
        );
        return result.customerOrdersByPaymentView;
    }

    const result = await adminApi<{
        visibleOrders: { items: CustomerOrderItem[]; totalItems: number };
    }>(
        `query CustomerOrdersPage($customerId: ID!, $options: OrderListOptions) {
            visibleOrders(options: $options, customerId: $customerId) {
                totalItems
                items { ${CUSTOMER_ORDER_ITEM_FIELDS} }
            }
        }`,
        { customerId, options },
    );
    return result.visibleOrders;
}

export interface CustomerOrderViewCounts {
    all: number;
    unpaid: number;
    partial: number;
    cancelled: number;
}

// Lean counts for the view chips — `options: { take: 0 }` returns totalItems (a real COUNT)
// without fetching any row data, same shape as fetchOrdersSummary's own chip counts
// (api/orders.ts). One round trip via GraphQL aliases, not four separate requests.
export async function fetchCustomerOrderViewCounts(
    customerId: string,
): Promise<CustomerOrderViewCounts> {
    const result = await adminApi<{
        all: { totalItems: number };
        cancelled: { totalItems: number };
        unpaid: { totalItems: number };
        partial: { totalItems: number };
    }>(
        `query CustomerOrderViewCounts($customerId: ID!) {
            all: visibleOrders(customerId: $customerId, options: { take: 0 }) { totalItems }
            cancelled: visibleOrders(
                customerId: $customerId
                options: { take: 0, filter: { state: { eq: "Cancelled" } } }
            ) { totalItems }
            unpaid: customerOrdersByPaymentView(
                customerId: $customerId
                paymentView: "unpaid"
                options: { take: 0 }
            ) { totalItems }
            partial: customerOrdersByPaymentView(
                customerId: $customerId
                paymentView: "partial"
                options: { take: 0 }
            ) { totalItems }
        }`,
        { customerId },
    );
    return {
        all: result.all.totalItems,
        cancelled: result.cancelled.totalItems,
        unpaid: result.unpaid.totalItems,
        partial: result.partial.totalItems,
    };
}

// Real per-order captured-payment total (plugin-acquiring's PaymentAttempt, our actual payment
// source of truth per AGENTS.md rule #11 — not Vendure's own `Order.payments`). Batched: one
// query for every order id a table page needs, not one per row. See
// PaymentAttemptService.sumCapturedAmountsByOrderIds for what "captured" means and what's
// deliberately not netted out (refunds/disputes/chargebacks).
export async function fetchOrderPaymentSummaries(orderIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!orderIds.length) return map;
    const result = await adminApi<{
        orderPaymentSummaries: { orderId: string; capturedAmount: number }[];
    }>(
        `query OrderPaymentSummaries($orderIds: [ID!]!) {
            orderPaymentSummaries(orderIds: $orderIds) { orderId capturedAmount }
        }`,
        { orderIds },
    );
    for (const summary of result.orderPaymentSummaries) {
        map.set(summary.orderId, summary.capturedAmount);
    }
    return map;
}

export interface CustomerDocument {
    id: string;
    type: string;
    number: string;
    status: string;
    issueDate: string;
}

// Document.status is a fixed internal technical state (the document-generation pipeline's own
// lifecycle — see plugin-documents/src/entities/document.entity.ts), not ERP-sourced business
// data — same carve-out as api/orders.ts's ORDER_STATE_OPTIONS. Document.type, unlike status, is
// real ERP/business-sourced data (invoice/contract/return/reconciliation/anything else the ERP
// pushes — see the entity's own doc comment) and must NOT be a hardcoded dropdown (AGENTS.md
// "Business data must live in the database") — it's exposed as free-text search instead (see
// CustomerDocumentsTab.vue's `type` filter field), same treatment as Customers page's
// `erpGroupLabel` free-text filter.
export const DOCUMENT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'generating', label: 'Generating' },
    { value: 'ready', label: 'Ready' },
    { value: 'failed', label: 'Failed' },
] as const;

export interface CustomerDocumentFilters {
    [key: string]: string;
    type: string;
    status: string;
}

export const DEFAULT_CUSTOMER_DOCUMENT_FILTERS: CustomerDocumentFilters = {
    type: '',
    status: '',
};

// Real server-side pagination (AGENTS.md "Pagination" rule — documents accumulate over a
// customer's lifetime just like orders/invoices/payments, and aren't exempt just because the
// tab is small on screen). Replaces an earlier flat `take: 100` fetch with no pagination at all,
// which silently dropped a long-lived customer's older documents past the 100th row with no way
// for the user to see more (found in the same pagination-antipattern audit as
// CustomerOrdersTab.vue's view-chip fix).
export async function fetchDocumentsPageForCounterparty(
    counterpartyId: string,
    page: number,
    pageSize: number,
    filters: CustomerDocumentFilters = DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
): Promise<{ items: CustomerDocument[]; totalItems: number }> {
    const result = await adminApi<{
        documents: { items: CustomerDocument[]; totalItems: number };
    }>(
        `query CustomerDocumentsPage($counterpartyId: ID!, $options: DocumentListOptions) {
            documents(options: $options, counterpartyId: $counterpartyId) {
                totalItems
                items { id type number status issueDate }
            }
        }`,
        {
            counterpartyId,
            options: {
                skip: (page - 1) * pageSize,
                take: pageSize,
                type: filters.type || undefined,
                status: filters.status || undefined,
            },
        },
    );
    return result.documents;
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
