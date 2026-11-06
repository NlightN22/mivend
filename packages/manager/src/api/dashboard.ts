import { adminApi } from './client';
import {
    DashboardApprovalsDocument,
    DashboardClientsDocument,
    DashboardOrdersDocument,
    type DashboardApprovalsQuery,
    type DashboardOrdersQuery,
} from './generated/graphql';

export type RecentOrder = DashboardOrdersQuery['recentOrdersList']['items'][number];
export type SubmittedApproval =
    DashboardApprovalsQuery['myApprovalRequestsSummary']['recent'][number];

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

// No unified activity/event log exists yet, so this is a best-effort merge of recent orders
// and approval requests, not a real feed.
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

export type DashboardSection = 'orders' | 'clients' | 'approvals';

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

export interface DashboardLoadResult {
    data: DashboardData;
    // Sections whose query rejected; their fields in `data` are empty defaults, not real zeros.
    failed: Partial<Record<DashboardSection, string>>;
}

// Vendure has no overdue state or SLA field: awaiting shipment is approximated as PaymentSettled
// and overdue as such orders placed more than 3 days ago.
const IN_PROGRESS_STATES_EXCLUDED = ['AddingItems', 'Draft', 'Cancelled', 'Delivered'];
const OVERDUE_AFTER_DAYS = 3;

async function fetchOrdersSection(): Promise<Partial<DashboardData>> {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const overdueBefore = new Date(
        now.getTime() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = await adminApi(DashboardOrdersDocument, {
        excludedStates: IN_PROGRESS_STATES_EXCLUDED,
        since24h,
        overdueBefore,
    });
    return {
        activeOrdersCount: result.activeOrders.totalItems,
        activeOrdersPlacedLast24h: result.activeOrdersLast24h.totalItems,
        awaitingShipmentCount: result.awaitingShipment.totalItems,
        overdueCount: result.overdue.totalItems,
        recentOrders: result.recentOrdersList.items,
    };
}

async function fetchClientsSection(): Promise<Partial<DashboardData>> {
    const result = await adminApi(DashboardClientsDocument);
    return {
        myClientsCount: result.counterpartySummary.totalCount,
        unassignedClientsCount: result.unassignedCounterpartyCount,
    };
}

async function fetchApprovalsSection(): Promise<Partial<DashboardData>> {
    const result = await adminApi(DashboardApprovalsDocument);
    return {
        pendingApprovalsCount: result.myApprovalRequestsSummary.pendingCount,
        recentApprovals: result.myApprovalRequestsSummary.recent,
        awaitingMyDecisionCount: result.myApprovalsInbox.awaitingMyDecision.totalItems,
    };
}

const SECTION_FETCHERS: Record<DashboardSection, () => Promise<Partial<DashboardData>>> = {
    orders: fetchOrdersSection,
    clients: fetchClientsSection,
    approvals: fetchApprovalsSection,
};

function emptyDashboardData(): DashboardData {
    return {
        activeOrdersCount: 0,
        activeOrdersPlacedLast24h: 0,
        awaitingShipmentCount: 0,
        overdueCount: 0,
        myClientsCount: 0,
        unassignedClientsCount: 0,
        recentOrders: [],
        pendingApprovalsCount: 0,
        recentApprovals: [],
        awaitingMyDecisionCount: 0,
    };
}

// One query per section so a single failing query (permission, resolver error) blanks only its own tiles.
export async function fetchDashboardData(): Promise<DashboardLoadResult> {
    const sections = Object.keys(SECTION_FETCHERS) as DashboardSection[];
    const settled = await Promise.allSettled(sections.map(section => SECTION_FETCHERS[section]()));
    const data = emptyDashboardData();
    const failed: DashboardLoadResult['failed'] = {};
    settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') Object.assign(data, outcome.value);
        else {
            const reason: unknown = outcome.reason;
            failed[sections[index]] = reason instanceof Error ? reason.message : String(reason);
            console.warn(`[dashboard] section "${sections[index]}" failed:`, reason);
        }
    });
    return { data, failed };
}
