import { adminApi } from './client';

export interface RecentOrder {
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
    customer: { firstName: string; lastName: string } | null;
}

export interface SubmittedApproval {
    id: string;
    requestType: string;
    status: string;
    currentStepRole: string | null;
    createdAt: string;
    decidedAt?: string | null;
}

export interface ActivityItem {
    id: string;
    text: string;
    at: string;
}

const REQUEST_TYPE_LABEL: Record<string, string> = {
    priceAdjustmentApproval: 'Price adjustment request',
    discountGrantApproval: 'Discount request',
    creditTermApproval: 'Payment term request',
};

// Built client-side from data the dashboard already fetches (recent orders + recent approval
// requests) — there is no unified activity/event log yet (see manager-portal-concept.md §8.1,
// "общий Центр уведомлений" was deferred), so this is a best-effort merge, not a real feed.
export function buildActivityFeed(
    orders: RecentOrder[],
    approvals: SubmittedApproval[],
    limit = 6,
): ActivityItem[] {
    const orderItems: ActivityItem[] = orders
        .filter(order => order.orderPlacedAt)
        .map(order => ({
            id: `order-${order.code}`,
            text: `Order ${order.code} placed by ${order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'a customer'}`,
            at: order.orderPlacedAt as string,
        }));

    const approvalItems: ActivityItem[] = approvals.map(approval => {
        const label = REQUEST_TYPE_LABEL[approval.requestType] ?? approval.requestType;
        if (approval.status !== 'pending' && approval.decidedAt) {
            return {
                id: `approval-${approval.id}`,
                text: `${label} #${approval.id} was ${approval.status}`,
                at: approval.decidedAt,
            };
        }
        return {
            id: `approval-${approval.id}`,
            text: `${label} #${approval.id} submitted`,
            at: approval.createdAt,
        };
    });

    return [...orderItems, ...approvalItems]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);
}

export interface DashboardData {
    activeOrdersCount: number;
    activeOrdersPlacedLast24h: number;
    awaitingShipmentCount: number;
    overdueCount: number;
    myClientsCount: number;
    recentOrders: RecentOrder[];
    pendingApprovalsCount: number;
    recentApprovals: SubmittedApproval[];
}

// Vendure ships no dedicated "overdue" order state or SLA field yet — "awaiting shipment" is
// approximated as paid-but-not-fulfilled (state PaymentSettled), and "overdue" as such an order
// placed more than 3 days ago. Revisit once erp-order exposes a real SLA/overdue signal.
const IN_PROGRESS_STATES_EXCLUDED = ['AddingItems', 'Cancelled', 'Delivered'];
const OVERDUE_AFTER_DAYS = 3;

const DASHBOARD_QUERY = `
    query ManagerDashboard(
        $excludedStates: [String!]!
        $since24h: DateTime!
        $overdueBefore: DateTime!
    ) {
        activeOrders: orders(options: { filter: { state: { notIn: $excludedStates } } }) {
            totalItems
        }
        activeOrdersLast24h: orders(
            options: {
                filter: { state: { notIn: $excludedStates }, orderPlacedAt: { after: $since24h } }
            }
        ) {
            totalItems
        }
        awaitingShipment: orders(options: { filter: { state: { eq: "PaymentSettled" } } }) {
            totalItems
        }
        overdue: orders(
            options: {
                filter: {
                    state: { eq: "PaymentSettled" }
                    orderPlacedAt: { before: $overdueBefore }
                }
            }
        ) {
            totalItems
        }
        recentOrdersList: orders(
            options: {
                take: 20
                sort: { orderPlacedAt: DESC }
                filter: { state: { notIn: ["AddingItems"] } }
            }
        ) {
            items {
                code
                state
                totalWithTax
                currencyCode
                orderPlacedAt
                customer { firstName lastName }
            }
        }
        counterparties {
            id
        }
        myApprovalRequestsSummary(recentLimit: 10) {
            pendingCount
            recent {
                id
                requestType
                status
                currentStepRole
                createdAt
                decidedAt
            }
        }
    }
`;

export async function fetchDashboardData(): Promise<DashboardData> {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const overdueBefore = new Date(
        now.getTime() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = await adminApi<{
        activeOrders: { totalItems: number };
        activeOrdersLast24h: { totalItems: number };
        awaitingShipment: { totalItems: number };
        overdue: { totalItems: number };
        recentOrdersList: { items: RecentOrder[] };
        counterparties: { id: string }[];
        myApprovalRequestsSummary: { pendingCount: number; recent: SubmittedApproval[] };
    }>(DASHBOARD_QUERY, {
        excludedStates: IN_PROGRESS_STATES_EXCLUDED,
        since24h,
        overdueBefore,
    });

    return {
        activeOrdersCount: result.activeOrders.totalItems,
        activeOrdersPlacedLast24h: result.activeOrdersLast24h.totalItems,
        awaitingShipmentCount: result.awaitingShipment.totalItems,
        overdueCount: result.overdue.totalItems,
        myClientsCount: result.counterparties.length,
        recentOrders: result.recentOrdersList.items,
        pendingApprovalsCount: result.myApprovalRequestsSummary.pendingCount,
        recentApprovals: result.myApprovalRequestsSummary.recent,
    };
}
