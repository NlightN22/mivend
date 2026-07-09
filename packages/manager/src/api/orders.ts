import { adminApi } from './client';

export interface OrderListItem {
    id: string;
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
    customer: {
        firstName: string;
        lastName: string;
        counterparty: {
            shortName: string;
            inn: string | null;
            assignedManagerId: string | null;
        } | null;
    } | null;
}

export interface OrdersFilters {
    search: string;
    state: string;
    dateRange: string;
    managerId: string;
}

export const DEFAULT_FILTERS: OrdersFilters = {
    search: '',
    state: '',
    dateRange: '',
    managerId: '',
};

// Order states are Vendure's own OrderProcess state machine — fixed by application logic, not
// ERP-sourced business data, so a const list is the documented carve-out in AGENTS.md ("internal
// technical states"), not a hardcoded business enum.
export const ORDER_STATE_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'AddingItems', label: 'Draft' },
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

function dateRangeToAfter(range: string): string {
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
    if (filters.search) {
        filter._or = [
            { code: { contains: filters.search } },
            { customerLastName: { contains: filters.search } },
        ];
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
    customer {
        firstName
        lastName
        counterparty { shortName inn assignedManagerId }
    }
`;

export async function fetchOrdersPage(
    filters: OrdersFilters,
    page: number,
    pageSize: number,
): Promise<{ items: OrderListItem[]; totalItems: number }> {
    const result = await adminApi<{
        visibleOrders: { items: OrderListItem[]; totalItems: number };
    }>(
        `query OrdersPage($options: OrderListOptions, $managerId: ID) {
            visibleOrders(options: $options, managerId: $managerId) {
                totalItems
                items { ${ORDER_ITEM_FIELDS} }
            }
        }`,
        {
            options: {
                skip: (page - 1) * pageSize,
                take: pageSize,
                sort: { orderPlacedAt: 'DESC' },
                filter: buildFilter(filters),
            },
            managerId: filters.managerId || undefined,
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
    waitingApprovalCount: number;
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
        today: { totalItems: number };
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
            open: visibleOrders(options: { filter: { state: { notIn: ["AddingItems", "Cancelled", "Delivered"] } } }) {
                totalItems
            }
            overdue: visibleOrders(
                options: { filter: { state: { eq: "PaymentSettled" }, orderPlacedAt: { before: $overdueBefore } } }
            ) {
                totalItems
            }
            today: visibleOrders(options: { filter: { orderPlacedAt: { after: $todayStart } } }) {
                totalItems
            }
            # Capped at 500 rows — there is no server-side SUM aggregate on the order list yet,
            # so "total amount"/attention/waiting-approval below are derived from this page
            # client-side. Fine for realistic scope sizes today; revisit with real aggregates
            # if that changes.
            allOpen: visibleOrders(
                options: {
                    take: 500
                    filter: { state: { notIn: ["AddingItems", "Cancelled", "Delivered"] } }
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
        waitingApprovalCount: result.allOpen.items.filter(o => pendingIds.has(o.id)).length,
        totalAmount: result.allOpen.items.reduce((sum, o) => sum + o.totalWithTax, 0),
        currencyCode: result.allOpen.items[0]?.currencyCode ?? 'USD',
        pendingApprovalOrderIds: pendingIds,
        attentionCandidates,
    };
}

export interface ManagerOption {
    id: string;
    name: string;
}

export async function fetchManagerOptions(): Promise<ManagerOption[]> {
    const result = await adminApi<{
        teamMembers: { id: string; firstName: string; lastName: string }[];
    }>(`query { teamMembers { id firstName lastName } }`);
    return result.teamMembers.map(a => ({ id: a.id, name: `${a.firstName} ${a.lastName}` }));
}
