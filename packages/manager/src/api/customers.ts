import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    ActiveDiscountCountForCounterpartyDocument,
    CounterpartyShortNameDocument,
    CreditByCounterpartyIdDocument,
    CreditForCounterpartyDocument,
    CreditLimitExceededCounterpartyIdsDocument,
    CustomerByIdDocument,
    CustomerDiscountGrantsPageDocument,
    CustomerDocumentsPageDocument,
    CustomerDocumentTypesDocument,
    CustomerIdForCounterpartyDocument,
    CustomerOrdersByPaymentViewDocument,
    CustomerOrderViewCountsDocument,
    CustomerOrdersDocument,
    CustomerOrdersPageDocument,
    CustomersPageDocument,
    CustomersSummaryDocument,
    DiscountGrantViewCountsDocument,
    HighUsageCustomersDocument,
    LastOrderDatesDocument,
    OrderPaymentSummariesDocument,
    ReassignCounterpartyManagerDocument,
    SetTradingPointActiveDocument,
    UnassignedCounterpartyCountDocument,
    UpdateTradingPointDetailsDocument,
    type CustomerListItemFieldsFragment,
    type CustomerOrderItemFieldsFragment,
} from './generated/graphql';

export type ContactPersonInfo =
    CustomerListItemFieldsFragment['tradingPoints'][number]['contacts'][number];
export type TradingPointInfo = CustomerListItemFieldsFragment['tradingPoints'][number];
export type CustomerListItem = CustomerListItemFieldsFragment & { contacts: ContactPersonInfo[] };

function toCustomerListItem(c: CustomerListItemFieldsFragment): CustomerListItem {
    return { ...c, contacts: c.tradingPoints.flatMap(tp => tp.contacts) };
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
    innStatus?: 'missing' | 'duplicate';
}

// Server-side paginated (see issue #39) — search/status/manager/branch/group/unassigned are all
// pushed down to CounterpartyListOptions, never filtered client-side over a partial page.
export async function fetchCustomersPage(
    options: CustomersListOptions,
): Promise<{ items: CustomerListItem[]; totalItems: number }> {
    const result = await adminApi(CustomersPageDocument, { options });
    return {
        items: result.counterparties.items.map(toCustomerListItem),
        totalItems: result.counterparties.totalItems,
    };
}

export async function fetchUnassignedCounterpartyCount(): Promise<number> {
    const result = await adminApi(UnassignedCounterpartyCountDocument);
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
    const result = await adminApi(CustomersSummaryDocument);
    return result.counterpartySummary;
}

export interface HighUsageCustomer extends CustomerListItem {
    creditLimit: number;
    creditBalance: number;
}

// Isolated request: a permission-gated credit failure must not null unrelated page data
// Wrapped in try/catch because callers without ReadCounterpartyCredit would otherwise throw
export async function fetchHighUsageCustomers(limit: number): Promise<HighUsageCustomer[]> {
    try {
        const result = await adminApi(HighUsageCustomersDocument, { limit });
        return result.highUsageCounterparties.map(c => ({
            ...toCustomerListItem(c),
            creditLimit: c.creditLimit ?? 0,
            creditBalance: c.creditBalance ?? 0,
        }));
    } catch {
        return [];
    }
}

export async function fetchCreditLimitExceededCounterpartyIds(): Promise<string[]> {
    try {
        const result = await adminApi(CreditLimitExceededCounterpartyIdsDocument);
        return result.creditLimitExceededCounterpartyIds;
    } catch {
        return [];
    }
}

// Stopgap: silently truncates past 500 rows
// A real fix needs a search-as-you-type picker over counterparties
export async function fetchAllCustomersCapped(): Promise<CustomerListItem[]> {
    const { items } = await fetchCustomersPage({ take: 500 });
    return items;
}

// Dedicated single-entity lookup (see counterparty.resolver.ts's `counterparty(id)`) — no longer
// depends on fetching the (now paginated) full list and filtering client-side by id.
export async function fetchCustomerById(counterpartyId: string): Promise<CustomerListItem | null> {
    const result = await adminApi(CustomerByIdDocument, { id: counterpartyId });
    return result.counterparty ? toCustomerListItem(result.counterparty) : null;
}

// Counterparties aren't a small preloadable set, so names are fetched per page by id
export async function fetchCounterpartyNames(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)];
    const results = await Promise.all(
        uniqueIds.map(id => adminApi(CounterpartyShortNameDocument, { id })),
    );
    return new Map(
        uniqueIds
            .map((id, i) => [id, results[i].counterparty?.shortName] as const)
            .filter((entry): entry is [string, string] => !!entry[1]),
    );
}

// Dept-heads are limited to their own department; portal-admin is unrestricted
// Throws for any other caller; the rule itself lives in CounterpartyService.reassignManager
export async function reassignCounterpartyManager(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(ReassignCounterpartyManagerDocument, { counterpartyId, administratorId });
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

// Distinct from ERP sync. Every successful call is recorded by VersioningService (History tab)
export async function updateTradingPointDetails(
    id: string,
    input: TradingPointDetailsPatch,
): Promise<void> {
    await adminApi(UpdateTradingPointDetailsDocument, { id, input });
}

// One-click reactivate/deactivate — sets both isActive and customerStatus together (see
// TradingPointService.setActive).
export async function setTradingPointActive(id: string, isActive: boolean): Promise<void> {
    await adminApi(SetTradingPointActiveDocument, { id, isActive });
}

// Vendure's Customer.id is a different id from Counterparty.id, which this page is keyed by
export async function fetchCustomerIdForCounterparty(
    counterpartyId: string,
): Promise<string | null> {
    // counterpartyId holds an id but is a plain String customField
    // Filter it with StringOperators, not IDOperators (customFields filters are flat)
    const result = await adminApi(CustomerIdForCounterpartyDocument, { counterpartyId });
    return result.customers.items[0]?.id ?? null;
}

export type CustomerOrderItem = Omit<CustomerOrderItemFieldsFragment, 'customFields'> & {
    customFields: NonNullable<CustomerOrderItemFieldsFragment['customFields']>;
};

// Schema says nullable, but Vendure always populates it, so callers may assume it's present
function normalizeOrderItem(item: CustomerOrderItemFieldsFragment): CustomerOrderItem {
    return {
        ...item,
        customFields: item.customFields ?? {
            latestFulfillmentState: null,
            placedByAdministratorId: null,
            reservationState: null,
        },
    };
}

export async function fetchOrdersForCustomer(
    customerId: string,
    take = 20,
): Promise<CustomerOrderItem[]> {
    const result = await adminApi(CustomerOrdersDocument, { customerId, take });
    return result.visibleOrders.items.map(normalizeOrderItem);
}

// Payment-status views live in plugin-acquiring: the reverse edge would be a circular dependency
// Chips must filter and paginate in the DB; client-side filtering made counts change across pages
export type CustomerOrdersView = 'all' | 'unpaid' | 'partial' | 'cancelled';

// Can't be a real admin id: placedByAdministratorId is null for storefront-placed orders
// Must match the value in CustomerOrdersDataTable.vue
export const PLACED_BY_CUSTOMER_VALUE = '__customer__';

export interface CustomerOrdersExtraFilters {
    // Independent of `view`; ignored when view === 'cancelled', which already pins state
    // Multi-select: eq for one value, in for several
    state?: string[];
    // plugin-reservation's customFields.reservationState — same field OrdersFilterBar's
    // "Reservation" filter uses on the main Orders page.
    reservationState?: string;
    // Inclusive on both ends; either bound may be open-ended
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
        // Filters on createdAt, not orderPlacedAt: unplaced orders (abandoned carts) must still show
        // `before` is the day after dateTo, so a range ending today includes all of today's orders
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
    // Custom fields in Shop/Admin API filters are flat, not nested under a customFields key
    // Nested form fails GraphQL validation (OrderFilterParameter), breaking the whole table
    if (extraFilters.reservationState)
        filter.reservationState = { eq: extraFilters.reservationState };
    if (extraFilters.fulfillmentState?.length) {
        // 'Not started' is a synthetic label for a null customField, so it needs isNull, not eq/in
        // Mixing it with real values needs an _or across isNull and in; one `in` can't express that
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
        const result = await adminApi(CustomerOrdersByPaymentViewDocument, {
            customerId,
            paymentView: view,
            options,
        });
        return {
            items: result.customerOrdersByPaymentView.items.map(normalizeOrderItem),
            totalItems: result.customerOrdersByPaymentView.totalItems,
        };
    }

    const result = await adminApi(CustomerOrdersPageDocument, { customerId, options });
    return {
        items: result.visibleOrders.items.map(normalizeOrderItem),
        totalItems: result.visibleOrders.totalItems,
    };
}

export interface CustomerOrderViewCounts {
    all: number;
    unpaid: number;
    partial: number;
    cancelled: number;
}

// take: 0 returns totalItems as a COUNT without row data; aliases batch all chips in one request
export async function fetchCustomerOrderViewCounts(
    customerId: string,
): Promise<CustomerOrderViewCounts> {
    const result = await adminApi(CustomerOrderViewCountsDocument, { customerId });
    return {
        all: result.all.totalItems,
        cancelled: result.cancelled.totalItems,
        unpaid: result.unpaid.totalItems,
        partial: result.partial.totalItems,
    };
}

// Source of truth is PaymentAttempt, not Vendure's Order.payments
// Batched by order id: one query per table page, not one per row
export async function fetchOrderPaymentSummaries(orderIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!orderIds.length) return map;
    const result = await adminApi(OrderPaymentSummariesDocument, { orderIds });
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

// Document.status is an internal pipeline state, so a hardcoded dropdown is fine
// Document.type is ERP-sourced, so it must come from the backend, never be hardcoded
export const DOCUMENT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'generating', label: 'Generating' },
    { value: 'ready', label: 'Ready' },
    { value: 'failed', label: 'Failed' },
] as const;

export const DOCUMENT_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'neutral',
    generating: 'warning',
    ready: 'success',
    failed: 'danger',
};

export interface CustomerDocumentFilters {
    // Real distinct values selected in the checklist filter (see DOCUMENT_STATUS_OPTIONS' own
    // doc comment) — exact match, not the old free-text substring search.
    types: string[];
    status: string;
    // Substring match against the document's own number (ILIKE) — see
    // DocumentsService.findVisible's doc comment.
    search: string;
}

export const DEFAULT_CUSTOMER_DOCUMENT_FILTERS: CustomerDocumentFilters = {
    types: [],
    status: '',
    search: '',
};

// Documents accumulate over a customer's lifetime, so this list must paginate server-side
export async function fetchDocumentsPageForCounterparty(
    counterpartyId: string,
    page: number,
    pageSize: number,
    filters: CustomerDocumentFilters = DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
): Promise<{ items: CustomerDocument[]; totalItems: number }> {
    const result = await adminApi(CustomerDocumentsPageDocument, {
        counterpartyId,
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            types: filters.types.length ? filters.types : undefined,
            status: filters.status || undefined,
            search: filters.search || undefined,
        },
    });
    return result.documents;
}

// Distinct types come from the backend, since Document.type is ERP-sourced and not hardcoded
export async function fetchDocumentTypes(counterpartyId: string): Promise<string[]> {
    const result = await adminApi(CustomerDocumentTypesDocument, { counterpartyId });
    return result.documentTypes;
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
}

// Isolated: creditLimit/creditBalance are permission-gated and must not share a request
// Scoped to the same options as the list query it enriches, so it stays bounded
export async function fetchCreditByCounterpartyId(
    options: CustomersListOptions,
): Promise<Map<string, CustomerCredit>> {
    try {
        const result = await adminApi(CreditByCounterpartyIdDocument, { options });
        return new Map(
            result.counterparties.items.map(c => [
                c.id,
                {
                    creditLimit: c.creditLimit ?? 0,
                    creditBalance: c.creditBalance ?? 0,
                    paymentDelayDays: c.paymentDelayDays ?? 0,
                },
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
        const result = await adminApi(CreditForCounterpartyDocument, { id: counterpartyId });
        return result.counterparty
            ? {
                  creditLimit: result.counterparty.creditLimit ?? 0,
                  creditBalance: result.counterparty.creditBalance ?? 0,
                  paymentDelayDays: result.counterparty.paymentDelayDays ?? 0,
              }
            : null;
    } catch {
        return null;
    }
}

// Counts grants for this counterparty only; discountRules(priceTypeCode) is shared by price type
// so customers sharing a price type would show identical counts
export async function fetchActiveDiscountCountsByCustomer(
    counterpartyIds: string[],
): Promise<Map<string, number>> {
    const entries = await Promise.all(
        [...new Set(counterpartyIds)].map(async counterpartyId => {
            // take: 0 fetches only totalItems; status is computed server-side
            // Don't recompute 'active' from validTo client-side; computeGrantStatus is the source of truth
            const result = await adminApi(ActiveDiscountCountForCounterpartyDocument, {
                counterpartyId,
                options: { take: 0, status: 'active' },
            });
            return [counterpartyId, result.discountGrantsForCounterparty.totalItems] as const;
        }),
    );
    return new Map(entries);
}

export type DiscountGrantStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountRuleItem {
    id: string;
    number: string;
    createdAt: string;
    percent: number;
    facetValueCode: string | null;
    validTo: string;
    status: DiscountGrantStatus;
}

export interface DiscountGrantFilters {
    [key: string]: string;
    search: string;
    status: string;
}

export const DEFAULT_DISCOUNT_GRANT_FILTERS: DiscountGrantFilters = { search: '', status: '' };

export const DISCOUNT_GRANT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'expiring-soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
] as const;

// Single source of truth for the status badge color (the frontend-rules skill's ui-kit rule) — mirrors
// PAYMENT_STATUS_BADGE_VARIANT/PROFORMA_INVOICE_STATUS_BADGE_VARIANT.
export const DISCOUNT_GRANT_STATUS_BADGE_VARIANT: Record<DiscountGrantStatus, StatusBadgeVariant> =
    {
        active: 'success',
        'expiring-soon': 'warning',
        expired: 'neutral',
    };

export interface DiscountGrantViewCounts {
    all: number;
    active: number;
    expiringSoon: number;
    expired: number;
}

// Aliased expiringSoon: GraphQL alias names can't contain the hyphen of 'expiring-soon'
export async function fetchDiscountGrantViewCounts(
    counterpartyId: string,
): Promise<DiscountGrantViewCounts> {
    const result = await adminApi(DiscountGrantViewCountsDocument, { counterpartyId });
    return {
        all: result.all.totalItems,
        active: result.active.totalItems,
        expiringSoon: result.expiringSoon.totalItems,
        expired: result.expired.totalItems,
    };
}

// Not discountRules(priceTypeCode): it leaks grants scoped to other customers on that price type
// Unbounded: one row per approved renewal over the customer's lifetime, so paginate
export async function fetchDiscountGrantsPage(
    counterpartyId: string,
    filters: DiscountGrantFilters,
    page: number,
    pageSize: number,
): Promise<{ items: DiscountRuleItem[]; totalItems: number }> {
    const result = await adminApi(CustomerDiscountGrantsPageDocument, {
        counterpartyId,
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            search: filters.search || undefined,
            status: filters.status || undefined,
        },
    });
    return result.discountGrantsForCounterparty as {
        items: DiscountRuleItem[];
        totalItems: number;
    };
}

// Capped at 500 rows: there is no per-customer MAX(orderPlacedAt) aggregate query yet
export async function fetchLastOrderDatesByCounterpartyId(): Promise<Map<string, string>> {
    const result = await adminApi(LastOrderDatesDocument);
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
