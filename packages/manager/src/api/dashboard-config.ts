import type { DashboardData } from './dashboard';

export interface KpiCardConfig {
    key: string;
    label: string;
    to: string;
    accent?: boolean;
    value: (data: DashboardData) => number;
    caption?: (data: DashboardData) => string;
}

// visibleOrders/counterparties are already scoped by the caller's access scope on the backend
// (own/department/all — see OrderVisibilityService.findVisible, CounterpartyService.findVisible),
// so these counts are department-wide for non-manager roles without any extra query.
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

// Operator has no approval-related permissions at all (see infrastructure/scripts/
// seed-access-roles.mjs — no RequestDiscountGrantApproval, no ApproveDiscountRequest), so unlike
// Manager it shows no approvals card; unlike Department Head it shows no approval-queue card
// either. Its scope is department-wide (accessScopeConfig.counterparty = 'department'), same
// visibleOrders/counterparties queries as everyone else, just no approvals angle.
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

// Roles that hold ApproveDiscountRequest (or an equivalent approval permission) per
// seed-access-roles.mjs — department-head, general-director, security-officer, portal-admin.
// Mirrors the existing `roleCode !== 'manager'`-style role checks elsewhere in the manager
// portal (e.g. OrdersPage.vue, CustomersPage.vue) rather than a hardcoded business enum: these
// are technical UI-composition keys, not domain data, and role codes themselves stay DB-driven.
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
