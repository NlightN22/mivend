<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
    MvBlockError,
    MvKpiCard,
    MvKpiCarousel,
    MvPanel,
    MvStatusBadge,
    MvFilterChips,
    type FilterChip,
} from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { useAuthStore } from '../../stores/auth';
import { buildActivityFeed, type DashboardSection } from '../../api/dashboard';
import { getDashboardKpiCards } from '../../api/dashboard-config';
import { useDashboard } from '../../composables/useDashboard';
import RecentOrdersTable from '../../components/dashboard/RecentOrdersTable.vue';
import ApprovalStatusList from '../../components/dashboard/ApprovalStatusList.vue';
import ExpiringDiscountsBanner from '../../components/dashboard/ExpiringDiscountsBanner.vue';
import QuickActionsPanel from '../../components/dashboard/QuickActionsPanel.vue';
import ActivityFeed from '../../components/dashboard/ActivityFeed.vue';
import IntegrationInboxErrorsPanel from '../../components/dashboard/IntegrationInboxErrorsPanel.vue';
import ReservationReconciliationPanel from '../../components/dashboard/ReservationReconciliationPanel.vue';
import PaymentReconciliationPanel from '../../components/dashboard/PaymentReconciliationPanel.vue';

const { t, te } = useI18n();
const authStore = useAuthStore();
const {
    data,
    failedSections,
    departmentName,
    expiringDiscounts,
    failedInboxEvents,
    reservationIssues,
    paymentIssues,
    grantsError,
    inboxError,
    notificationsError,
    loading,
    load,
} = useDashboard();

const failedSectionKeys = computed(() => Object.keys(failedSections.value) as DashboardSection[]);
const filterChips = computed<FilterChip[]>(() => [
    { key: 'all', label: t('dashboardParts.chips.all') },
    { key: 'in-progress', label: t('dashboardParts.chips.inProgress') },
    { key: 'awaiting-shipment', label: t('dashboardParts.chips.awaitingShipment') },
    { key: 'today', label: t('dashboardParts.chips.today') },
]);

const sectionError = (section: DashboardSection): string =>
    t('dashboardParts.page.sectionFailed', {
        section: t(`dashboardParts.section.${section}`),
        reason: failedSections.value[section] ?? '',
    });
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
                ? orders.filter(
                      o => o.orderPlacedAt && new Date(o.orderPlacedAt).toDateString() === today,
                  )
                : orders;
    return matched.slice(0, 5);
});

const kpiCards = computed(() =>
    getDashboardKpiCards(authStore.roleCode).filter(
        card => !(card.section in failedSections.value),
    ),
);

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
    return [...counts.entries()]
        .map(([type, count]) => {
            const key = `dashboardParts.approvalStatus.requestType.${type}`;
            return `${count} ${te(key) ? t(key) : type}`;
        })
        .join(', ');
});

onMounted(load);
</script>

<template>
    <div class="dashboard">
        <div class="dashboard__header">
            <div>
                <div class="dashboard__breadcrumb">{{ t('dashboardParts.page.breadcrumb') }}</div>
                <h1 class="dashboard__title">
                    {{ t('dashboardParts.page.welcome', { name: authStore.fullName }) }}
                </h1>
                <p class="dashboard__subtitle">
                    {{ t('dashboardParts.page.subtitle', { date: formatDate(new Date()) }) }}
                </p>
            </div>
            <div class="dashboard__context">
                <MvStatusBadge variant="info">{{
                    authStore.roleLabel ?? authStore.roleCode
                }}</MvStatusBadge>
                <MvStatusBadge v-if="departmentName" variant="neutral">{{
                    departmentName
                }}</MvStatusBadge>
            </div>
        </div>

        <div v-if="failedSectionKeys.length || grantsError" class="dashboard__errors">
            <MvBlockError
                v-for="section in failedSectionKeys"
                :key="section"
                :title="t('common.blockLoadFailed')"
                :message="sectionError(section)"
                :retry-label="t('common.retry')"
                :retrying="loading"
                @retry="load"
            />
            <MvBlockError
                v-if="grantsError"
                :title="t('common.blockLoadFailed')"
                :message="grantsError"
                :retry-label="t('common.retry')"
                :retrying="loading"
                @retry="load"
            />
        </div>
        <ExpiringDiscountsBanner v-if="!grantsError" :discounts="expiringDiscounts" />

        <MvKpiCarousel v-if="data && kpiCards.length" class="dashboard__kpis">
            <MvKpiCard
                v-for="card in kpiCards"
                :key="card.key"
                :label="card.label"
                :value="card.value(data)"
                :caption="
                    card.key === 'pending-approvals' ? pendingBreakdown : card.caption?.(data)
                "
                :to="card.to"
                :accent="card.accent"
            />
        </MvKpiCarousel>

        <div v-if="data" class="dashboard__grid">
            <div class="dashboard__left-stack">
                <MvPanel :title="t('dashboardParts.page.recentOrders')">
                    <template #header-actions>
                        <RouterLink to="/orders">{{ t('dashboardParts.page.viewAll') }}</RouterLink>
                    </template>
                    <template #subheader>
                        <MvFilterChips
                            :chips="filterChips"
                            :active="activeFilter"
                            @select="activeFilter = $event"
                        />
                    </template>
                    <MvBlockError
                        v-if="failedSections.orders"
                        :title="t('common.blockLoadFailed')"
                        :message="failedSections.orders ?? ''"
                    />
                    <RecentOrdersTable v-else :orders="filteredOrders" />
                </MvPanel>

                <MvPanel :title="t('dashboardParts.page.approvalRequests')">
                    <template #header-actions>
                        <RouterLink to="/approvals">{{
                            t('dashboardParts.page.openSubmitted')
                        }}</RouterLink>
                    </template>
                    <MvBlockError
                        v-if="failedSections.approvals"
                        :title="t('common.blockLoadFailed')"
                        :message="failedSections.approvals ?? ''"
                    />
                    <ApprovalStatusList v-else :approvals="data.recentApprovals.slice(0, 5)" />
                </MvPanel>

                <MvPanel
                    v-if="authStore.hasPermission('ManageAccessControl')"
                    :title="t('dashboardParts.page.inboxErrors')"
                >
                    <MvBlockError
                        v-if="inboxError"
                        :title="t('common.blockLoadFailed')"
                        :message="inboxError"
                    />
                    <IntegrationInboxErrorsPanel v-else :events="failedInboxEvents" />
                </MvPanel>

                <MvPanel
                    v-if="authStore.hasPermission('ReadOrder')"
                    :title="t('dashboardParts.page.reservationReconciliation')"
                >
                    <MvBlockError
                        v-if="notificationsError"
                        :title="t('common.blockLoadFailed')"
                        :message="notificationsError"
                    />
                    <ReservationReconciliationPanel v-else :notifications="reservationIssues" />
                </MvPanel>

                <MvPanel
                    v-if="authStore.hasPermission('ReadPayment')"
                    :title="t('dashboardParts.page.paymentReconciliation')"
                >
                    <MvBlockError
                        v-if="notificationsError"
                        :title="t('common.blockLoadFailed')"
                        :message="notificationsError"
                    />
                    <PaymentReconciliationPanel v-else :notifications="paymentIssues" />
                </MvPanel>
            </div>

            <aside class="dashboard__right-stack">
                <MvPanel :title="t('dashboardParts.page.quickActions')">
                    <QuickActionsPanel />
                </MvPanel>

                <MvPanel :title="t('dashboardParts.page.activityFeed')">
                    <ActivityFeed :items="activityItems" :failed="failedSections" />
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
    color: var(--el-text-color-secondary);
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
    color: var(--el-text-color-secondary);
}

.dashboard__context {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.dashboard__errors {
    display: grid;
    gap: 8px;
    margin-bottom: 18px;
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
