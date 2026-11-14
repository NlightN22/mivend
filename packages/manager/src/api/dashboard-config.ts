import { tr } from '../utils/lazyLabels';
import type { DashboardData, DashboardSection } from './dashboard';

export interface KpiCardConfig {
    key: string;
    section: DashboardSection;
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
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.activeOrders');
        },
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data =>
            tr('dashboardParts.kpi.placedLast24h', { count: data.activeOrdersPlacedLast24h }),
    },
    {
        key: 'awaiting-shipment',
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.awaitingShipment');
        },
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => tr('dashboardParts.kpi.overdue', { count: data.overdueCount }),
    },
    {
        key: 'pending-approvals',
        section: 'approvals',
        get label() {
            return tr('dashboardParts.kpi.pendingApprovals');
        },
        to: '/approvals',
        accent: true,
        value: data => data.pendingApprovalsCount,
    },
    {
        key: 'my-clients',
        section: 'clients',
        get label() {
            return tr('dashboardParts.kpi.myClients');
        },
        to: '/customers',
        value: data => data.myClientsCount,
    },
];

// Operator holds no approval permissions (see seed-access-roles.mjs), so no approvals cards are shown.
// Its counterparty scope is 'department', so the shared visibleOrders/counterparties queries apply.
const OPERATOR_CARDS: KpiCardConfig[] = [
    {
        key: 'department-orders',
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.departmentOrders');
        },
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data =>
            tr('dashboardParts.kpi.placedLast24h', { count: data.activeOrdersPlacedLast24h }),
    },
    {
        key: 'awaiting-shipment',
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.awaitingShipment');
        },
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => tr('dashboardParts.kpi.overdue', { count: data.overdueCount }),
    },
    {
        key: 'department-clients',
        section: 'clients',
        get label() {
            return tr('dashboardParts.kpi.departmentClients');
        },
        to: '/customers',
        value: data => data.myClientsCount,
    },
];

const APPROVER_CARDS: KpiCardConfig[] = [
    {
        key: 'awaiting-my-decision',
        section: 'approvals',
        get label() {
            return tr('dashboardParts.kpi.awaitingMyDecision');
        },
        to: '/approvals',
        accent: true,
        value: data => data.awaitingMyDecisionCount,
    },
    {
        key: 'department-orders',
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.departmentOrders');
        },
        to: '/orders',
        value: data => data.activeOrdersCount,
        caption: data =>
            tr('dashboardParts.kpi.placedLast24h', { count: data.activeOrdersPlacedLast24h }),
    },
    {
        key: 'awaiting-shipment',
        section: 'orders',
        get label() {
            return tr('dashboardParts.kpi.awaitingShipment');
        },
        to: '/orders',
        accent: true,
        value: data => data.awaitingShipmentCount,
        caption: data => tr('dashboardParts.kpi.overdue', { count: data.overdueCount }),
    },
    {
        key: 'department-clients',
        section: 'clients',
        get label() {
            return tr('dashboardParts.kpi.departmentClients');
        },
        to: '/customers',
        value: data => data.myClientsCount,
    },
    {
        key: 'unassigned-clients',
        section: 'clients',
        get label() {
            return tr('dashboardParts.kpi.unassignedClients');
        },
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
