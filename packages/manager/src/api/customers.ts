import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    ActiveDiscountCountForCounterpartyDocument,
    CounterpartyShortNameDocument,
    CreditByCounterpartyIdDocument,
    CreditForCounterpartyDocument,
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

// Includes creditLimit/creditBalance inline — unlike the main list, this is already its own
// isolated request (small, ReadCounterpartyCredit-gated, top-N only), so it doesn't risk nulling
// out unrelated page data the way sharing a request with the main list would (see
// fetchCreditByCounterpartyId's comment). Wrapped in try/catch for callers without the permission.
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
    const result = await adminApi(CustomerByIdDocument, { id: counterpartyId });
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
        uniqueIds.map(id => adminApi(CounterpartyShortNameDocument, { id })),
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

// Staff patch, distinct from ERP sync — gated on "can see this counterparty" (see
// TradingPointAdminResolver.updateTradingPointDetails). Every successful call is recorded by
// VersioningService for the customer's History tab.
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

// Vendure's Customer.id (needed to filter orders/create draft orders) is a different id than
// the Counterparty.id this whole page is keyed by — see CounterpartyService.getForCustomer for
// the reverse direction of this same lookup.
export async function fetchCustomerIdForCounterparty(
    counterpartyId: string,
): Promise<string | null> {
    // counterpartyId is a customField, filterable as a flat StringOperators field (not
    // IDOperators, even though it holds an id) — the same gotcha the backend-plugin-rules skill
    // documents for Shop API custom field filters being flat; here it's also typed as plain
    // String, not ID.
    const result = await adminApi(CustomerIdForCounterpartyDocument, { counterpartyId });
    return result.customers.items[0]?.id ?? null;
}

export type CustomerOrderItem = Omit<CustomerOrderItemFieldsFragment, 'customFields'> & {
    customFields: NonNullable<CustomerOrderItemFieldsFragment['customFields']>;
};

// Order.customFields is nullable at the wrapper-object level per the GraphQL schema, but Vendure
// always populates it in practice (custom fields default to null values, never a missing
// object) — normalized here once so every caller downstream can keep assuming it's present, as
// this file's own consumers always have.
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
    // see the backend-plugin-rules skill's Vendure gotcha. Real incident this fixes: `filter.customFields = {...}`
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

// Lean counts for the view chips — `options: { take: 0 }` returns totalItems (a real COUNT)
// without fetching any row data, same shape as fetchOrdersSummary's own chip counts
// (api/orders.ts). One round trip via GraphQL aliases, not four separate requests.
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

// Real per-order captured-payment total (plugin-acquiring's PaymentAttempt, our actual payment
// source of truth per the external-integration-rules skill — not Vendure's own `Order.payments`). Batched: one
// query for every order id a table page needs, not one per row. See
// PaymentAttemptService.sumCapturedAmountsByOrderIds for what "captured" means and what's
// deliberately not netted out (refunds/disputes/chargebacks).
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

// Document.status is a fixed internal technical state (the document-generation pipeline's own
// lifecycle — see plugin-documents/src/entities/document.entity.ts), not ERP-sourced business
// data — same carve-out as api/orders.ts's ORDER_STATE_OPTIONS. Document.type, unlike status, is
// real ERP/business-sourced data (invoice/contract/return/reconciliation/anything else the ERP
// pushes — see the entity's own doc comment) and must NOT be a hardcoded dropdown (the backend-plugin-rules skill's
// "Business data must live in the database") — but that doesn't rule out a checklist filter, only
// a *hardcoded* one: fetchDocumentTypes below pulls the real, currently-visible distinct type
// values from the backend (plugin-documents' new `documentTypes` query, a real bounded DISTINCT,
// not a hardcoded list) and CustomerDocumentsDataTable.vue renders those as checkboxes, same
// shape as any other checklist filter, just backend-driven rather than a source-code enum.
export const DOCUMENT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'generating', label: 'Generating' },
    { value: 'ready', label: 'Ready' },
    { value: 'failed', label: 'Failed' },
] as const;

// Single source of truth for the status badge color (the frontend-rules skill's ui-kit rule) — mirrors
// PAYMENT_STATUS_BADGE_VARIANT/INVOICE_STATUS_BADGE_VARIANT. Previously an inline variant()
// function local to CustomerDocumentsTab.vue.
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

// Real server-side pagination (the backend-plugin-rules skill's "Pagination" rule — documents accumulate over a
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

// Real distinct Document.type values within this counterparty's visible documents — backs the
// Type column's checklist filter (see DOCUMENT_STATUS_OPTIONS' own doc comment). A small, bounded
// aggregate (plugin-documents' DocumentsService.findVisibleTypes), not a hardcoded list.
export async function fetchDocumentTypes(counterpartyId: string): Promise<string[]> {
    const result = await adminApi(CustomerDocumentTypesDocument, { counterpartyId });
    return result.documentTypes;
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
        const result = await adminApi(CreditByCounterpartyIdDocument, { options });
        return new Map(
            result.counterparties.items.map(c => [
                c.id,
                { creditLimit: c.creditLimit ?? 0, creditBalance: c.creditBalance ?? 0 },
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
    const entries = await Promise.all(
        [...new Set(counterpartyIds)].map(async counterpartyId => {
            // take: 0 — only totalItems is needed, mirrors DiscountRegistryService's own
            // countByStatus helper (findAllPaginated(ctx, { take: 0, status })). status: 'active'
            // is computed server-side (DiscountGrantService.computeGrantStatus), the single
            // source of truth this used to duplicate client-side via a raw validTo comparison.
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
// PAYMENT_STATUS_BADGE_VARIANT/INVOICE_STATUS_BADGE_VARIANT.
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

// Lean counts for the view chips (`options: { take: 0 }` returns totalItems, a real COUNT, with
// no row data) — same shape as fetchCustomerOrderViewCounts/fetchInvoiceViewCounts above, one
// round trip via GraphQL aliases (aliased `expiringSoon` since GraphQL alias names can't contain
// a hyphen like the `expiring-soon` status value itself).
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

// Only grants that actually apply to this counterparty (company-wide or scoped to it) — see
// DiscountGrantService.findForCounterparty. Using discountRules(priceTypeCode) here would leak
// grants scoped to a *different* customer that happens to share the same price type. Real
// server-side pagination (the backend-plugin-rules skill's "Pagination" rule) — this list is not genuinely bounded, it
// accumulates one row per approved renewal over the customer's whole lifetime (nothing removes an
// expired grant).
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

// Keyed by counterparty id (the "customer" this whole page means) — capped at 500 rows, same
// tradeoff as OrdersSummary's "total amount": there is no per-customer MAX(orderPlacedAt)
// aggregate query yet.
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
