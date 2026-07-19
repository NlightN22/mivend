import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';

export interface OrderListItem {
    id: string;
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
    customFields: { reservationState: string } | null;
    customer: {
        firstName: string;
        lastName: string;
        counterparty: {
            shortName: string;
            inn: string | null;
            priceType: string;
            assignedManagerId: string | null;
            branchId: string | null;
        } | null;
    } | null;
}

export interface OrdersFilters {
    // Index signature lets OrdersFilters satisfy useUrlSyncedState's generic Record<string,
    // string> constraint — all fields here are already flat strings, this doesn't loosen
    // anything real.
    [key: string]: string;
    search: string;
    state: string;
    dateRange: string;
    managerId: string;
    reservationState: string;
}

export const DEFAULT_FILTERS: OrdersFilters = {
    search: '',
    state: '',
    dateRange: '',
    managerId: '',
    reservationState: '',
};

// Order.customFields.reservationState — an internal technical enum fixed by app logic (see
// plugin-reservation/src/types.ts), not ERP business data, same carve-out as ORDER_STATE_OPTIONS.
export const ORDER_RESERVATION_STATE_OPTIONS = [
    { value: '', label: 'Any reservation state' },
    { value: 'AWAITING_CONFIRMATION', label: 'Awaiting confirmation' },
    { value: 'RESERVED', label: 'Reserved' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'RELEASED', label: 'Released' },
    { value: 'FAILED', label: 'Failed' },
] as const;

// Single source of truth for the Reservation badge color — same reasoning/precedent as
// ORDER_STATE_BADGE_VARIANT/FULFILLMENT_STATE_BADGE_VARIANT above.
export const ORDER_RESERVATION_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    AWAITING_CONFIRMATION: 'warning',
    RESERVED: 'success',
    EXPIRED: 'danger',
    RELEASED: 'neutral',
    FAILED: 'danger',
};

// Order states are Vendure's own OrderProcess state machine — fixed by application logic, not
// ERP-sourced business data, so a const list is the documented carve-out in AGENTS.md ("internal
// technical states"), not a hardcoded business enum.
export const ORDER_STATE_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'AddingItems', label: 'Draft (storefront cart)' },
    // "Draft" (capitalized) is Vendure's distinct state for orders created via the admin
    // draft-order flow — see /orders/new (createDraftOrder) — not the same state as a
    // customer's own in-progress cart (AddingItems).
    { value: 'Draft', label: 'Draft (order entry)' },
    { value: 'ArrangingPayment', label: 'Arranging payment' },
    { value: 'PaymentAuthorized', label: 'Processing' },
    { value: 'PaymentSettled', label: 'Awaiting shipment' },
    { value: 'PartiallyShipped', label: 'Partially shipped' },
    { value: 'Shipped', label: 'Shipped' },
    { value: 'PartiallyDelivered', label: 'Partially delivered' },
    { value: 'Delivered', label: 'Delivered' },
    { value: 'Cancelled', label: 'Cancelled' },
] as const;

export const DATE_RANGE_OPTIONS = [
    { value: '', label: 'Last 7 days' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'month', label: 'This month' },
] as const;

export function dateRangeToAfter(range: string): string {
    const now = new Date();
    switch (range) {
        case 'today':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        case 'yesterday':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        default:
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
}

function buildFilter(filters: OrdersFilters): Record<string, unknown> {
    const filter: Record<string, unknown> = {
        orderPlacedAt: { after: dateRangeToAfter(filters.dateRange) },
    };
    if (filters.state) filter.state = { eq: filters.state };
    if (filters.reservationState) {
        // Flat, not nested under `customFields` — see AGENTS.md's Vendure gotcha and
        // api/customers.ts's identical fix (same bug, same root cause: `filter.customFields`
        // isn't a valid `OrderFilterParameter` shape, so this silently matched nothing).
        filter.reservationState = { eq: filters.reservationState };
    }
    return filter;
}

const ORDER_ITEM_FIELDS = `
    id
    code
    state
    totalWithTax
    currencyCode
    orderPlacedAt
    customFields { reservationState }
    customer {
        firstName
        lastName
        counterparty { shortName inn priceType assignedManagerId branchId }
    }
`;

// Real Vendure OrderSortParameter keys only — the PrimeVue DataTable's own column `field` names
// (see OrdersDataTable.vue) don't all match 1:1 (e.g. its 'total'/'date' columns sort by
// totalWithTax/orderPlacedAt), so callers map through this before building the `sort` object.
export type OrderSortField = 'code' | 'state' | 'totalWithTax' | 'orderPlacedAt';

export async function fetchOrdersPage(
    filters: OrdersFilters,
    page: number,
    pageSize: number,
    // Object insertion order = ORDER BY clause order — supports Vendure's own multi-field sort
    // (see OrdersDataTable.vue's sortMode="multiple"). Defaults to the original single-field
    // "newest first" behavior when omitted.
    sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = { orderPlacedAt: 'DESC' },
): Promise<{ items: OrderListItem[]; totalItems: number }> {
    const result = await adminApi<{
        visibleOrders: { items: OrderListItem[]; totalItems: number };
    }>(
        `query OrdersPage($options: OrderListOptions, $managerId: ID, $search: String) {
            visibleOrders(options: $options, managerId: $managerId, search: $search) {
                totalItems
                items { ${ORDER_ITEM_FIELDS} }
            }
        }`,
        {
            options: {
                skip: (page - 1) * pageSize,
                take: pageSize,
                sort,
                filter: buildFilter(filters),
            },
            managerId: filters.managerId || undefined,
            search: filters.search || undefined,
        },
    );
    return result.visibleOrders;
}

export interface AttentionCandidate {
    id: string;
    code: string;
    state: string;
    orderPlacedAt: string | null;
    customerName: string;
}

export interface OrdersSummary {
    openCount: number;
    overdueCount: number;
    todayCount: number;
    todayAmount: number;
    waitingApprovalCount: number;
    processingCount: number;
    draftCount: number;
    totalAmount: number;
    currencyCode: string;
    pendingApprovalOrderIds: Set<string>;
    attentionCandidates: AttentionCandidate[];
}

const OVERDUE_AFTER_DAYS = 3;

export async function fetchOrdersSummary(): Promise<OrdersSummary> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const overdueBefore = new Date(
        now.getTime() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = await adminApi<{
        open: { totalItems: number };
        overdue: { totalItems: number };
        today: { totalItems: number; items: { totalWithTax: number }[] };
        processing: { totalItems: number };
        drafts: { totalItems: number };
        allOpen: {
            items: {
                id: string;
                code: string;
                state: string;
                orderPlacedAt: string | null;
                totalWithTax: number;
                currencyCode: string;
                customer: { firstName: string; lastName: string } | null;
            }[];
        };
        pendingPriceAdjustmentOrderIds: string[];
    }>(
        `query OrdersSummary($overdueBefore: DateTime!, $todayStart: DateTime!) {
            open: visibleOrders(options: { filter: { state: { notIn: ["AddingItems", "Draft", "Cancelled", "Delivered"] } } }) {
                totalItems
            }
            overdue: visibleOrders(
                options: { filter: { state: { eq: "PaymentSettled" }, orderPlacedAt: { before: $overdueBefore } } }
            ) {
                totalItems
            }
            today: visibleOrders(options: { take: 500, filter: { orderPlacedAt: { after: $todayStart } } }) {
                totalItems
                items { totalWithTax }
            }
            processing: visibleOrders(options: { filter: { state: { eq: "PaymentAuthorized" } } }) {
                totalItems
            }
            drafts: visibleOrders(options: { filter: { state: { eq: "Draft" } } }) {
                totalItems
            }
            # Capped at 500 rows — there is no server-side SUM aggregate on the order list yet,
            # so "total amount"/attention/waiting-approval below are derived from this page
            # client-side. Fine for realistic scope sizes today; revisit with real aggregates
            # if that changes.
            allOpen: visibleOrders(
                options: {
                    take: 500
                    filter: { state: { notIn: ["AddingItems", "Draft", "Cancelled", "Delivered"] } }
                }
            ) {
                items {
                    id
                    code
                    state
                    orderPlacedAt
                    totalWithTax
                    currencyCode
                    customer { firstName lastName }
                }
            }
            pendingPriceAdjustmentOrderIds
        }`,
        { overdueBefore, todayStart },
    );

    const pendingIds = new Set(result.pendingPriceAdjustmentOrderIds);
    const overdueBeforeMs = new Date(overdueBefore).getTime();
    const isOverdue = (o: (typeof result.allOpen.items)[number]): boolean =>
        o.state === 'PaymentSettled' &&
        !!o.orderPlacedAt &&
        new Date(o.orderPlacedAt).getTime() < overdueBeforeMs;

    const attentionCandidates: AttentionCandidate[] = result.allOpen.items
        .filter(o => pendingIds.has(o.id) || isOverdue(o))
        .map(o => ({
            id: o.id,
            code: o.code,
            state: o.state,
            orderPlacedAt: o.orderPlacedAt,
            customerName: o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : '—',
        }));

    return {
        openCount: result.open.totalItems,
        overdueCount: result.overdue.totalItems,
        todayCount: result.today.totalItems,
        todayAmount: result.today.items.reduce((sum, o) => sum + o.totalWithTax, 0),
        waitingApprovalCount: result.allOpen.items.filter(o => pendingIds.has(o.id)).length,
        processingCount: result.processing.totalItems,
        draftCount: result.drafts.totalItems,
        totalAmount: result.allOpen.items.reduce((sum, o) => sum + o.totalWithTax, 0),
        currencyCode: result.allOpen.items[0]?.currencyCode ?? 'USD',
        pendingApprovalOrderIds: pendingIds,
        attentionCandidates,
    };
}

// Shared between OrdersTable.vue and CustomerOrdersTab.vue — the same Order.state values must
// read the same everywhere in the manager portal.
export const ORDER_STATE_LABEL: Record<string, string> = {
    AddingItems: 'Draft (storefront cart)',
    Draft: 'Draft (order entry)',
    ArrangingPayment: 'Arranging payment',
    PaymentAuthorized: 'Processing',
    PaymentSettled: 'Awaiting shipment',
    PartiallyShipped: 'Partially shipped',
    Shipped: 'Shipped',
    PartiallyDelivered: 'Partially delivered',
    Delivered: 'Delivered',
    Cancelled: 'Cancelled',
};

// Single source of truth for Commercial-state badge color — keyed by the raw Order.state
// (not the label above), so relabeling ORDER_STATE_LABEL never silently breaks this map.
// Any manager-portal component rendering a Commercial state badge must use this, not its own
// ad hoc variant — see AGENTS.md's ui-kit "single source of truth" rule and the real incident
// this fixes: OrdersTable.vue/CustomerOrdersTab.vue were each rendering this badge with no
// variant at all (always the default gray), and Fulfillment separately hardcoded 'info' for
// every state regardless of value — neither read as intended, and the two tables didn't even
// agree with each other since Fulfillment's map lived nowhere.
export const ORDER_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    AddingItems: 'neutral',
    Draft: 'neutral',
    ArrangingPayment: 'warning',
    PaymentAuthorized: 'info',
    PaymentSettled: 'info',
    PartiallyShipped: 'warning',
    Shipped: 'info',
    PartiallyDelivered: 'warning',
    Delivered: 'success',
    Cancelled: 'danger',
};

// Single source of truth for the Fulfillment badge color — keyed by the real Vendure
// Fulfillment.state value, plus the synthetic 'Not started' CustomerOrdersTab.vue/OrdersTable.vue
// use when an order has no fulfillment yet at all.
export const FULFILLMENT_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    'Not started': 'neutral',
    Pending: 'warning',
    Shipped: 'info',
    Delivered: 'success',
    Cancelled: 'danger',
};

// Mirrors the keys above — real Fulfillment.state values (Vendure's own default fulfillment
// process) plus the synthetic 'Not started' — used as the Fulfillment column's filter options
// (see customFields.latestFulfillmentState in api/customers.ts).
export const FULFILLMENT_STATE_OPTIONS = [
    { value: 'Not started', label: 'Not started' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Shipped', label: 'Shipped' },
    { value: 'Delivered', label: 'Delivered' },
    { value: 'Cancelled', label: 'Cancelled' },
] as const;

// Single source of truth for "how far along" a fulfillment stage is — a *sequence position*
// (Not started -> Pending -> Shipped -> Delivered), not a quantity-fulfilled ratio. Real bug this
// fixes: CustomerOrdersTab.vue's fulfillmentProgress() previously computed
// fulfilledQuantity/totalQuantity, which is 100% the moment a single Fulfillment record exists
// covering all lines regardless of that fulfillment's own state — so Pending, Shipped, and
// Delivered orders all rendered a fully-filled progress bar, indistinguishable from each other
// (the seed data's typical one-fulfillment-per-order shape made this especially obvious).
// 'Cancelled' has no defined stage — it's a terminal state off the normal progression, not a
// percentage of it; callers should branch on it separately (e.g. render the bar as empty/hidden)
// rather than looking it up here.
export const FULFILLMENT_STAGE_INDEX: Record<string, number> = {
    'Not started': 0,
    Pending: 1,
    Shipped: 2,
    Delivered: 3,
};
export const FULFILLMENT_STAGE_COUNT = 3;

export interface ManagerOption {
    id: string;
    name: string;
    email: string;
    roleCodes: string[];
}

export async function fetchManagerOptions(): Promise<ManagerOption[]> {
    const result = await adminApi<{
        teamMembers: {
            id: string;
            firstName: string;
            lastName: string;
            emailAddress: string;
            roleCodes: string[];
        }[];
    }>(`query TeamMembers { teamMembers { id firstName lastName emailAddress roleCodes } }`);
    return result.teamMembers.map(a => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.emailAddress,
        roleCodes: a.roleCodes,
    }));
}

export interface BranchOption {
    // erpId, not Branch's DB row id — Counterparty.branchId (see OrderListItem.customer.
    // counterparty.branchId) stores the ERP id, same convention as departmentId.
    erpId: string;
    name: string;
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
    const result = await adminApi<{ branches: { erpId: string; name: string }[] }>(
        `query Branches { branches { erpId name } }`,
    );
    return result.branches;
}

export interface SavedTableView {
    id: string;
    name: string;
    filters: string;
    visibleColumns: string[];
}

const SAVED_TABLE_VIEW_FIELDS = `id name filters visibleColumns`;

export async function fetchMyTableViews(pageKey: string): Promise<SavedTableView[]> {
    const result = await adminApi<{ myTableViews: SavedTableView[] }>(
        `query MyTableViews($pageKey: String!) {
            myTableViews(pageKey: $pageKey) { ${SAVED_TABLE_VIEW_FIELDS} }
        }`,
        { pageKey },
    );
    return result.myTableViews;
}

export async function saveTableView(
    pageKey: string,
    name: string,
    filters: string,
    visibleColumns: string[],
): Promise<SavedTableView> {
    const result = await adminApi<{ saveTableView: SavedTableView }>(
        `mutation SaveTableView($pageKey: String!, $name: String!, $filters: String!, $visibleColumns: [String!]!) {
            saveTableView(pageKey: $pageKey, name: $name, filters: $filters, visibleColumns: $visibleColumns) {
                ${SAVED_TABLE_VIEW_FIELDS}
            }
        }`,
        { pageKey, name, filters, visibleColumns },
    );
    return result.saveTableView;
}

export async function deleteTableView(id: string): Promise<boolean> {
    const result = await adminApi<{ deleteTableView: boolean }>(
        `mutation DeleteTableView($id: ID!) {
            deleteTableView(id: $id)
        }`,
        { id },
    );
    return result.deleteTableView;
}
