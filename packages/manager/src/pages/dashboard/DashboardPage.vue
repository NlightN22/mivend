<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvKpiCard, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { adminApi } from '../../api/client';
import { fetchDashboardData, buildActivityFeed, type DashboardData } from '../../api/dashboard';
import RecentOrdersTable from '../../components/dashboard/RecentOrdersTable.vue';
import ApprovalStatusList from '../../components/dashboard/ApprovalStatusList.vue';
import ExpiringDiscountsBanner from '../../components/dashboard/ExpiringDiscountsBanner.vue';
import QuickActionsPanel from '../../components/dashboard/QuickActionsPanel.vue';
import ActivityFeed from '../../components/dashboard/ActivityFeed.vue';
import SavedFilterChips, { type FilterChip } from '../../components/dashboard/SavedFilterChips.vue';

const authStore = useAuthStore();
const data = ref<DashboardData | null>(null);
const departmentName = ref<string | null>(null);
const loading = ref(true);

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
        const [dashboard, departmentsResult] = await Promise.all([
            fetchDashboardData(),
            adminApi<{ departments: { id: string; name: string }[] }>(
                `query { departments { id name } }`,
            ),
        ]);
        data.value = dashboard;
        const departmentId = authStore.administrator?.customFields.departmentId;
        departmentName.value =
            departmentsResult.departments.find(d => d.id === departmentId)?.name ?? null;
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

        <ExpiringDiscountsBanner :discounts="[]" />

        <div v-if="data" class="dashboard__kpis">
            <MvKpiCard
                label="Active orders"
                :value="data.activeOrdersCount"
                :caption="`${data.activeOrdersPlacedLast24h} placed in the last 24h`"
                to="/orders"
            />
            <MvKpiCard
                label="Awaiting shipment / overdue"
                :value="data.awaitingShipmentCount"
                :caption="`${data.overdueCount} overdue (>3 days)`"
                to="/orders"
                accent
            />
            <MvKpiCard
                label="Pending approval requests"
                :value="data.pendingApprovalsCount"
                :caption="pendingBreakdown"
                to="/approvals"
                accent
            />
            <MvKpiCard label="My clients" :value="data.myClientsCount" to="/customers" />
        </div>

        <div v-if="data" class="dashboard__grid">
            <div class="dashboard__left-stack">
                <MvPanel title="Recent orders">
                    <template #header-actions>
                        <RouterLink to="/orders">View all</RouterLink>
                    </template>
                    <template #subheader>
                        <SavedFilterChips
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
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
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
    .dashboard__kpis {
        grid-template-columns: repeat(2, 1fr);
    }

    .dashboard__grid {
        grid-template-columns: 1fr;
    }
}
</style>
