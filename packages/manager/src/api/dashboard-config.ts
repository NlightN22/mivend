import type { DashboardData } from './dashboard';

export interface KpiCardConfig {
    key: string;
    label: string;
    to: string;
    accent?: boolean;
    value: (data: DashboardData) => number;
    caption?: (data: DashboardData) => string;
}

// visibleOrders/counterparties are already scoped by the backend access scope (own/department/all).
// so these counts need no extra query to be department-wide for non-manager roles.
const MANAGER_CARDS: KpiCardConfig[] = [
    {
        key: 'active-orders',
        label: 'Active orders',
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data => `${data.activeOrdersPlacedLast24h} placed in the last 24h`,
    },
    {
        key: 'awaiting-shipment',
        label: 'Awaiting shipment / overdue',
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => `${data.overdueCount} overdue (>3 days)`,
    },
    {
        key: 'pending-approvals',
        label: 'My pending approval requests',
        to: '/approvals',
        accent: true,
        value: data => data.pendingApprovalsCount,
    },
    {
        key: 'my-clients',
        label: 'My clients',
        to: '/customers',
        value: data => data.myClientsCount,
    },
];

// Operator holds no approval permissions (see seed-access-roles.mjs), so no approvals cards are shown.
// Its counterparty scope is 'department', so the shared visibleOrders/counterparties queries apply.
const OPERATOR_CARDS: KpiCardConfig[] = [
    {
        key: 'department-orders',
        label: 'Department orders',
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data => `${data.activeOrdersPlacedLast24h} placed in the last 24h`,
    },
    {
        key: 'awaiting-shipment',
        label: 'Awaiting shipment / overdue',
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => `${data.overdueCount} overdue (>3 days)`,
    },
    {
        key: 'department-clients',
        label: 'Department clients',
        to: '/customers',
        value: data => data.myClientsCount,
    },
];

const APPROVER_CARDS: KpiCardConfig[] = [
    {
        key: 'awaiting-my-decision',
        label: 'Awaiting my decision',
        to: '/approvals',
        accent: true,
        value: data => data.awaitingMyDecisionCount,
    },
    {
        key: 'department-orders',
        label: 'Department orders',
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data => `${data.activeOrdersPlacedLast24h} placed in the last 24h`,
    },
    {
        key: 'awaiting-shipment',
        label: 'Awaiting shipment / overdue',
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => `${data.overdueCount} overdue (>3 days)`,
    },
    {
        key: 'department-clients',
        label: 'Department clients',
        to: '/customers',
        value: data => data.myClientsCount,
    },
    {
        key: 'unassigned-clients',
        label: 'Unassigned clients',
        to: '/customers?managerId=__unassigned__',
        accent: true,
        value: data => data.unassignedClientsCount,
    },
];

// UI-only keys (not domain data), mirroring existing roleCode checks; role codes stay DB-driven.
// Keep in sync with seed-access-roles.mjs when ApproveDiscountRequest holders change.
const APPROVER_ROLE_CODES = new Set([
    'department-head',
    'general-director',
    'security-officer',
    'portal-admin',
]);

export function getDashboardKpiCards(roleCode: string | null): KpiCardConfig[] {
    if (roleCode === null || roleCode === 'manager') return MANAGER_CARDS;
    if (roleCode === 'operator') return OPERATOR_CARDS;
    if (APPROVER_ROLE_CODES.has(roleCode)) return APPROVER_CARDS;
    return MANAGER_CARDS;
}
