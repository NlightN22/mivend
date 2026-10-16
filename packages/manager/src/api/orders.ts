import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    BranchesDocument,
    DeleteTableViewDocument,
    MyTableViewsDocument,
    OrdersPageDocument,
    OrdersSummaryDocument,
    SaveTableViewDocument,
    TeamMembersDocument,
    type OrderListItemFieldsFragment,
} from './generated/graphql';

export type OrderListItem = OrderListItemFieldsFragment;

export interface OrdersFilters {
    // Index signature so OrdersFilters satisfies useUrlSyncedState's Record<string, string> constraint.
    // All fields are flat strings, so this loosens nothing.
    [key: string]: string;
    search: string;
    state: string;
    dateRange: string;
    managerId: string;
    reservationState: string;
    erpStatus: string;
    reservationFailed: string;
    hasCheckFindings: string;
}

export const DEFAULT_FILTERS: OrdersFilters = {
    search: '',
    state: '',
    dateRange: '',
    managerId: '',
    reservationState: '',
    erpStatus: '',
    reservationFailed: '',
    hasCheckFindings: '',
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

// Order.customFields.reservationFailureReason (plugin-reservation/src/types.ts) — why the last
// automatic reserve failed; set means "needs staff attention", cleared by a successful reserve (#199).
export const RESERVATION_FAILURE_LABEL: Record<string, string> = {
    INSUFFICIENT_STOCK: 'Not enough stock',
    ERP_EXPORT_DATA_MISSING: 'Missing data for the ERP',
    NOT_ELIGIBLE: 'The order cannot be reserved',
    UNEXPECTED: 'Unexpected error',
};

// Vendure's own OrderProcess states, not ERP business data; a const list is intentional here.
// Documented carve-out for internal technical states in backend-plugin-rules.
export const ORDER_STATE_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'AddingItems', label: 'Draft (storefront cart)' },
    // 'Draft' (capitalized) is the admin draft-order state, distinct from a customer's AddingItems cart.
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
        // Must be flat, not under customFields: filter.customFields is not a valid OrderFilterParameter
        // shape and silently matches nothing.
        filter.reservationState = { eq: filters.reservationState };
    }
    if (filters.erpStatus) {
        filter.erpStatus = { in: filters.erpStatus.split(',') };
    }
    if (filters.reservationFailed) {
        filter.reservationFailureReason = { isNull: false };
    }
    if (filters.hasCheckFindings) filter.hasCheckFindings = { eq: true };
    return filter;
}

// Must use real Vendure OrderSortParameter keys: DataTable column fields don't map 1:1
// (e.g. 'total' -> totalWithTax), so callers map through this before building sort.
export type OrderSortField = 'code' | 'state' | 'totalWithTax' | 'orderPlacedAt' | 'createdAt';

export async function fetchOrdersPage(
    filters: OrdersFilters,
    page: number,
    pageSize: number,
    // Key insertion order is the ORDER BY clause order; multi-field sort relies on it.
    sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = { createdAt: 'DESC' },
): Promise<{ items: OrderListItem[]; totalItems: number }> {
    const result = await adminApi(OrdersPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            sort,
            filter: buildFilter(filters),
        },
        managerId: filters.managerId || undefined,
        search: filters.search || undefined,
    });
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

    const result = await adminApi(OrdersSummaryDocument, { overdueBefore, todayStart });

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

// Keyed by raw Order.state, not the label, so relabeling ORDER_STATE_LABEL can't break colors.
// All Commercial-state badges must use this map, not a local variant.
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

// Keyed by Fulfillment.state plus the synthetic 'Not started', which has no Fulfillment record.
export const FULFILLMENT_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    'Not started': 'neutral',
    Pending: 'warning',
    Shipped: 'info',
    Delivered: 'success',
    Cancelled: 'danger',
};

// Must stay in sync with the badge map keys above; 'Not started' is synthetic, not a Vendure state.
export const FULFILLMENT_STATE_OPTIONS = [
    { value: 'Not started', label: 'Not started' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Shipped', label: 'Shipped' },
    { value: 'Delivered', label: 'Delivered' },
    { value: 'Cancelled', label: 'Cancelled' },
] as const;

// Not a quantity ratio: one fulfillment covering all lines reads 100% whatever its state.
// 'Cancelled' is off the sequence; callers must branch on it before looking up here.
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
    const result = await adminApi(TeamMembersDocument);
    return result.teamMembers.map(a => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.emailAddress,
        roleCodes: a.roleCodes,
    }));
}

export interface BranchOption {
    // Branch.id (DB primary key), never erpId: branchId fields and comparisons all use this value.
    // Branch is mivend-internal with no ERP counterpart; ERP's Department is a different entity.
    id: string;
    // Only set by BranchService.upsert from an ERP point code; createManual Branches have none.
    // Display-only; never compare against a branchId field.
    erpId: string;
    name: string;
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
    const result = await adminApi(BranchesDocument);
    return result.branches;
}

export interface SavedTableView {
    id: string;
    name: string;
    filters: string;
    visibleColumns: string[];
}

export async function fetchMyTableViews(pageKey: string): Promise<SavedTableView[]> {
    const result = await adminApi(MyTableViewsDocument, { pageKey });
    return result.myTableViews;
}

export async function saveTableView(
    pageKey: string,
    name: string,
    filters: string,
    visibleColumns: string[],
): Promise<SavedTableView> {
    const result = await adminApi(SaveTableViewDocument, {
        pageKey,
        name,
        filters,
        visibleColumns,
    });
    return result.saveTableView;
}

export async function deleteTableView(id: string): Promise<boolean> {
    const result = await adminApi(DeleteTableViewDocument, { id });
    return result.deleteTableView;
}
