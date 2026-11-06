import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const adminApiMock = vi.fn();
vi.mock('../../api/client', async () => {
    const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
    return { ...actual, adminApi: (...args: unknown[]) => adminApiMock(...args) };
});
vi.mock('../../api/discounts', () => ({ fetchExpiringDiscountGrants: vi.fn() }));
vi.mock('../../api/team', () => ({ fetchDepartments: vi.fn().mockResolvedValue([]) }));
vi.mock('../../api/notifications', () => ({ fetchNotifications: vi.fn() }));
vi.mock('../../api/integration-health', () => ({ fetchFailedIntegrationInboxEvents: vi.fn() }));

import { fetchDashboardData } from '../../api/dashboard';
import { getDashboardKpiCards } from '../../api/dashboard-config';
import { fetchExpiringDiscountGrants } from '../../api/discounts';
import { useDashboard } from '../../composables/useDashboard';

const ORDERS = {
    activeOrders: { totalItems: 7 },
    activeOrdersLast24h: { totalItems: 2 },
    awaitingShipment: { totalItems: 3 },
    overdue: { totalItems: 1 },
    recentOrdersList: { items: [] },
};
const CLIENTS = { counterpartySummary: { totalCount: 40 }, unassignedCounterpartyCount: 4 };
const APPROVALS = {
    myApprovalRequestsSummary: { pendingCount: 2, recent: [] },
    myApprovalsInbox: { awaitingMyDecision: { totalItems: 5 } },
};

function answer(failing: string[] = []): void {
    adminApiMock.mockImplementation(async (document: { toString(): string }) => {
        const text = document.toString();
        const name = ['DashboardOrders', 'DashboardClients', 'DashboardApprovals'].find(n =>
            text.includes(`query ${n}`),
        );
        if (name && failing.includes(name)) throw new Error('You are not currently authorized');
        if (name === 'DashboardOrders') return ORDERS;
        if (name === 'DashboardClients') return CLIENTS;
        return APPROVALS;
    });
}

describe('fetchDashboardData', () => {
    beforeEach(() => {
        adminApiMock.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('returns every section when all queries succeed', async () => {
        answer();
        const { data, failed } = await fetchDashboardData();
        expect(failed).toEqual({});
        expect(data).toMatchObject({
            activeOrdersCount: 7,
            myClientsCount: 40,
            unassignedClientsCount: 4,
            pendingApprovalsCount: 2,
            awaitingMyDecisionCount: 5,
        });
    });

    it('keeps the other sections and reports the one whose query rejected', async () => {
        answer(['DashboardClients']);
        const { data, failed } = await fetchDashboardData();
        expect(Object.keys(failed)).toEqual(['clients']);
        expect(failed.clients).toContain('not currently authorized');
        expect(data.activeOrdersCount).toBe(7);
        expect(data.awaitingMyDecisionCount).toBe(5);
        expect(data.myClientsCount).toBe(0);
    });

    it('does not throw when every query rejects', async () => {
        answer(['DashboardOrders', 'DashboardClients', 'DashboardApprovals']);
        const { failed } = await fetchDashboardData();
        expect(Object.keys(failed).sort()).toEqual(['approvals', 'clients', 'orders']);
    });

    it('lets each KPI card be dropped by the section it depends on', () => {
        const sections = new Set(getDashboardKpiCards('general-director').map(c => c.section));
        expect([...sections].sort()).toEqual(['approvals', 'clients', 'orders']);
    });
});

describe('useDashboard', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        adminApiMock.mockReset();
        vi.mocked(fetchExpiringDiscountGrants).mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('still renders data when the expiring-discounts query rejects, and retry clears the failure', async () => {
        answer(['DashboardApprovals']);
        vi.mocked(fetchExpiringDiscountGrants).mockRejectedValue(new Error('boom'));
        const dashboard = useDashboard();
        await dashboard.load();
        expect(dashboard.data.value?.activeOrdersCount).toBe(7);
        expect(Object.keys(dashboard.failedSections.value)).toEqual(['approvals']);
        expect(dashboard.expiringDiscounts.value).toEqual([]);
        expect(dashboard.loading.value).toBe(false);

        answer();
        vi.mocked(fetchExpiringDiscountGrants).mockResolvedValue([]);
        await dashboard.load();
        expect(dashboard.failedSections.value).toEqual({});
    });
});
