<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
    MvKpiCard,
    MvKpiCarousel,
    MvPanel,
    MvStatusBadge,
    MvFilterChips,
    type FilterChip,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { adminApi } from '../../api/client';
import { fetchDashboardData, buildActivityFeed, type DashboardData } from '../../api/dashboard';
import { getDashboardKpiCards } from '../../api/dashboard-config';
import { fetchExpiringDiscountGrants } from '../../api/discounts';
import {
    fetchFailedIntegrationInboxEvents,
    fetchOpenPaymentReconciliationIssues,
    fetchOpenReservationReconciliationIssues,
    type FailedIntegrationInboxEvent,
    type PaymentReconciliationIssue,
    type ReservationReconciliationIssue,
} from '../../api/integration-health';
import RecentOrdersTable from '../../components/dashboard/RecentOrdersTable.vue';
import ApprovalStatusList from '../../components/dashboard/ApprovalStatusList.vue';
import ExpiringDiscountsBanner, {
    type ExpiringDiscount,
} from '../../components/dashboard/ExpiringDiscountsBanner.vue';
import QuickActionsPanel from '../../components/dashboard/QuickActionsPanel.vue';
import ActivityFeed from '../../components/dashboard/ActivityFeed.vue';
import IntegrationInboxErrorsPanel from '../../components/dashboard/IntegrationInboxErrorsPanel.vue';
import ReservationReconciliationPanel from '../../components/dashboard/ReservationReconciliationPanel.vue';
import PaymentReconciliationPanel from '../../components/dashboard/PaymentReconciliationPanel.vue';

const authStore = useAuthStore();
const data = ref<DashboardData | null>(null);
const departmentName = ref<string | null>(null);
const expiringDiscounts = ref<ExpiringDiscount[]>([]);
const failedInboxEvents = ref<FailedIntegrationInboxEvent[]>([]);
const reservationIssues = ref<ReservationReconciliationIssue[]>([]);
const paymentIssues = ref<PaymentReconciliationIssue[]>([]);
const loading = ref(true);

// Small, fixed row cap for dashboard attention panels — these are "is anything on fire" widgets,
// not paginated lists (there is no "view all" target page for any of the three yet).
const HEALTH_PANEL_TAKE = 10;

// Same placeholder threshold used on /discounts (docs/ai/manager-portal-concept.md §8.2 — no
// exact "expiring soon" window has been decided yet).
const EXPIRING_SOON_DAYS = 14;

const FILTER_CHIPS: FilterChip[] = [
    { key: 'all', label: 'All' },
    { key: 'in-progress', label: 'In progress' },
    { key: 'awaiting-shipment', label: 'Awaiting shipment' },
    { key: 'today', label: "Today's" },
];
const activeFilter = ref('all');

const filteredOrders = computed(() => {
    if (!data.value) return [];
    const orders = data.value.recentOrders;
    const today = new Date().toDateString();
    const matched =
        activeFilter.value === 'in-progress'
            ? orders.filter(o => o.state === 'PaymentAuthorized')
            : activeFilter.value === 'awaiting-shipment'
              ? orders.filter(o => o.state === 'PaymentSettled')
              : activeFilter.value === 'today'
                ? orders.filter(o => o.orderPlacedAt && new Date(o.orderPlacedAt).toDateString() === today)
                : orders;
    return matched.slice(0, 5);
});

const kpiCards = computed(() => getDashboardKpiCards(authStore.roleCode));

const activityItems = computed(() =>
    data.value ? buildActivityFeed(data.value.recentOrders, data.value.recentApprovals) : [],
);

const pendingBreakdown = computed(() => {
    if (!data.value) return '';
    const counts = new Map<string, number>();
    for (const approval of data.value.recentApprovals) {
        if (approval.status !== 'pending') continue;
        counts.set(approval.requestType, (counts.get(approval.requestType) ?? 0) + 1);
    }
    if (!counts.size) return '';
    return [...counts.entries()].map(([type, count]) => `${count} ${type}`).join(', ');
});

onMounted(async () => {
    try {
        // Each of these three health panels comes from a plugin's own new query — caught
        // individually so one plugin's outage (or, right now, one query not deployed yet) never
        // blanks the whole dashboard, same reasoning as the department-name fetch below.
        const [dashboard, grants, failedEvents, reconReservations, reconPayments] = await Promise.all([
            fetchDashboardData(),
            fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
            authStore.hasPermission('ManageAccessControl')
                ? fetchFailedIntegrationInboxEvents(HEALTH_PANEL_TAKE).catch(e => {
                      console.warn('[dashboard] could not load failed integration inbox events:', e);
                      return [];
                  })
                : Promise.resolve([]),
            authStore.hasPermission('ReadOrder')
                ? fetchOpenReservationReconciliationIssues(HEALTH_PANEL_TAKE).catch(e => {
                      console.warn('[dashboard] could not load reservation reconciliation issues:', e);
                      return [];
                  })
                : Promise.resolve([]),
            authStore.hasPermission('ReadPayment')
                ? fetchOpenPaymentReconciliationIssues(HEALTH_PANEL_TAKE).catch(e => {
                      console.warn('[dashboard] could not load payment reconciliation issues:', e);
                      return [];
                  })
                : Promise.resolve([]),
        ]);
        data.value = dashboard;
        failedInboxEvents.value = failedEvents;
        reservationIssues.value = reconReservations;
        paymentIssues.value = reconPayments;
        // One grant can list several customers (see DiscountGrant.counterparties) — the banner
        // shows one line per customer, same shape as the design mock.
        expiringDiscounts.value = grants.flatMap(grant =>
            grant.counterparties.map(cp => ({
                id: `${grant.id}-${cp.id}`,
                customerName: cp.legalName,
                validTo: grant.validTo,
            })),
        );

        // Cosmetic (department name badge next to the role badge) — kept independent of the
        // main dashboard data so a failure here never blanks the whole page.
        try {
            const departmentId = authStore.administrator?.customFields.departmentId;
            const departmentsResult = await adminApi<{
                departments: { erpId: string; name: string }[];
            }>(`query { departments { erpId name } }`);
            // administrator.customFields.departmentId stores the ERP id (see
            // EmployeeService.assign), not Department's DB row id — match on erpId.
            departmentName.value =
                departmentsResult.departments.find(d => d.erpId === departmentId)?.name ?? null;
        } catch (e) {
            console.warn('[dashboard] could not load department name:', e);
        }
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <div class="dashboard">
        <div class="dashboard__header">
            <div>
                <div class="dashboard__breadcrumb">Dashboard</div>
                <h1 class="dashboard__title">Welcome back, {{ authStore.fullName }}</h1>
                <p class="dashboard__subtitle">
                    {{ new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }}
                    · Your operational summary for today.
                </p>
            </div>
            <div class="dashboard__context">
                <MvStatusBadge variant="info">{{ authStore.roleLabel ?? authStore.roleCode }}</MvStatusBadge>
                <MvStatusBadge v-if="departmentName" variant="neutral">{{ departmentName }}</MvStatusBadge>
            </div>
        </div>

        <ExpiringDiscountsBanner :discounts="expiringDiscounts" />

        <MvKpiCarousel v-if="data" class="dashboard__kpis">
            <MvKpiCard
                v-for="card in kpiCards"
                :key="card.key"
                :label="card.label"
                :value="card.value(data)"
                :caption="card.key === 'pending-approvals' ? pendingBreakdown : card.caption?.(data)"
                :to="card.to"
                :accent="card.accent"
            />
        </MvKpiCarousel>

        <div v-if="data" class="dashboard__grid">
            <div class="dashboard__left-stack">
                <MvPanel title="Recent orders">
                    <template #header-actions>
                        <RouterLink to="/orders">View all</RouterLink>
                    </template>
                    <template #subheader>
                        <MvFilterChips
                            :chips="FILTER_CHIPS"
                            :active="activeFilter"
                            @select="activeFilter = $event"
                        />
                    </template>
                    <RecentOrdersTable :orders="filteredOrders" />
                </MvPanel>

                <MvPanel title="My approval requests status">
                    <template #header-actions>
                        <RouterLink to="/approvals">Open submitted</RouterLink>
                    </template>
                    <ApprovalStatusList :approvals="data.recentApprovals.slice(0, 5)" />
                </MvPanel>

                <MvPanel v-if="authStore.hasPermission('ManageAccessControl')" title="Integration inbox errors">
                    <IntegrationInboxErrorsPanel :events="failedInboxEvents" />
                </MvPanel>

                <MvPanel v-if="authStore.hasPermission('ReadOrder')" title="Reservation reconciliation">
                    <ReservationReconciliationPanel :issues="reservationIssues" />
                </MvPanel>

                <MvPanel v-if="authStore.hasPermission('ReadPayment')" title="Payment reconciliation">
                    <PaymentReconciliationPanel :issues="paymentIssues" />
                </MvPanel>
            </div>

            <aside class="dashboard__right-stack">
                <MvPanel title="Quick actions">
                    <QuickActionsPanel />
                </MvPanel>

                <MvPanel title="Activity feed">
                    <ActivityFeed :items="activityItems" />
                </MvPanel>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.dashboard__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
}

.dashboard__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.dashboard__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.dashboard__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.dashboard__context {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.dashboard__kpis {
    margin-bottom: 18px;
}

.dashboard__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 18px;
    align-items: start;
}

.dashboard__left-stack,
.dashboard__right-stack {
    display: grid;
    gap: 18px;
    min-width: 0;
}

@media (max-width: 1200px) {
    .dashboard__grid {
        grid-template-columns: 1fr;
    }
}
</style>
