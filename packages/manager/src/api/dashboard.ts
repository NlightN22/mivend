import { adminApi } from './client';
import { ManagerDashboardDocument, type ManagerDashboardQuery } from './generated/graphql';

export type RecentOrder = ManagerDashboardQuery['recentOrdersList']['items'][number];
export type SubmittedApproval =
    ManagerDashboardQuery['myApprovalRequestsSummary']['recent'][number];

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
    unassignedClientsCount: number;
    recentOrders: RecentOrder[];
    pendingApprovalsCount: number;
    recentApprovals: SubmittedApproval[];
    awaitingMyDecisionCount: number;
}

// Vendure ships no dedicated "overdue" order state or SLA field yet — "awaiting shipment" is
// approximated as paid-but-not-fulfilled (state PaymentSettled), and "overdue" as such an order
// placed more than 3 days ago. Revisit once erp-order exposes a real SLA/overdue signal.
const IN_PROGRESS_STATES_EXCLUDED = ['AddingItems', 'Draft', 'Cancelled', 'Delivered'];
const OVERDUE_AFTER_DAYS = 3;

export async function fetchDashboardData(): Promise<DashboardData> {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const overdueBefore = new Date(
        now.getTime() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = await adminApi(ManagerDashboardDocument, {
        excludedStates: IN_PROGRESS_STATES_EXCLUDED,
        since24h,
        overdueBefore,
    });

    return {
        activeOrdersCount: result.activeOrders.totalItems,
        activeOrdersPlacedLast24h: result.activeOrdersLast24h.totalItems,
        awaitingShipmentCount: result.awaitingShipment.totalItems,
        overdueCount: result.overdue.totalItems,
        myClientsCount: result.counterpartySummary.totalCount,
        unassignedClientsCount: result.unassignedCounterpartyCount,
        recentOrders: result.recentOrdersList.items,
        pendingApprovalsCount: result.myApprovalRequestsSummary.pendingCount,
        recentApprovals: result.myApprovalRequestsSummary.recent,
        awaitingMyDecisionCount: result.myApprovalsInbox.awaitingMyDecision.totalItems,
    };
}
