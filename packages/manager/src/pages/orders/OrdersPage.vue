<script setup lang="ts">
import { ref } from 'vue';
import {
    MvKpiCard,
    MvKpiCarousel,
    MvPanel,
    MvWarningBanner,
    MvButton,
    MvNotice,
    MvSkeleton,
    MvStatusBadge,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useOrdersOverview } from '../../composables/useOrdersOverview';
import { BLANK_ORDERS_FILTERS, restoreSavedFilters, todayRange } from '../../api/orders-list';
import type { SavedTableView } from '../../api/orders';
import OrdersList from '../../components/orders/OrdersList.vue';
import AttentionList from '../../components/orders/AttentionList.vue';
import OperationalPanel from '../../components/orders/OperationalPanel.vue';
import SavedViewsPanel from '../../components/orders/SavedViewsPanel.vue';
import MyTableViewsPanel from '../../components/orders/MyTableViewsPanel.vue';

const authStore = useAuthStore();
const overview = useOrdersOverview();
const list = ref<InstanceType<typeof OrdersList> | null>(null);

// "Waiting approval" has no order filter of its own; it resets to the unfiltered list.
function applySavedView(key: string): void {
    const base = { ...BLANK_ORDERS_FILTERS };
    if (key === 'processing') base.state = ['PaymentAuthorized'];
    else if (key === 'drafts') base.state = ['Draft'];
    else if (key === 'today') base.dateRange = todayRange();
    list.value?.applyFilters(base);
}

function recallTableView(view: SavedTableView): void {
    list.value?.applyFilters(restoreSavedFilters(view.filters));
}
</script>

<template>
    <div class="orders-page">
        <div class="orders-page__header">
            <div>
                <div class="orders-page__breadcrumb">Workspace / Orders</div>
                <h1 class="orders-page__title">Orders</h1>
            </div>
            <div class="orders-page__context">
                <MvStatusBadge variant="info">{{
                    authStore.roleLabel ?? authStore.roleCode
                }}</MvStatusBadge>
                <MvStatusBadge v-if="overview.departmentName.value" variant="neutral">{{
                    overview.departmentName.value
                }}</MvStatusBadge>
            </div>
        </div>

        <MvWarningBanner
            v-if="overview.summary.value && overview.summary.value.attentionCount"
            action-text="Open problem orders"
            action-to="/orders"
        >
            <strong>{{ overview.summary.value.attentionCount }} orders need attention.</strong>
            Some are overdue for shipment or have a price adjustment awaiting approval.
        </MvWarningBanner>

        <MvKpiCarousel
            v-if="overview.summary.value"
            class="orders-page__kpis"
            data-testid="orders-kpis"
        >
            <MvKpiCard label="Open orders" :value="overview.summary.value.openCount" />
            <MvKpiCard
                label="Waiting approval"
                :value="overview.summary.value.waitingApprovalCount"
                accent
            />
            <MvKpiCard
                label="Today's amount"
                :value="overview.todayAmountFormatted.value"
                :caption="`${overview.summary.value.todayCount} orders today`"
            />
        </MvKpiCarousel>
        <MvNotice v-else-if="overview.summaryError.value" variant="error" class="orders-page__kpis">
            Could not load the orders summary.
            <MvButton size="sm" variant="ghost" @click="overview.loadSummary">Retry</MvButton>
        </MvNotice>
        <MvSkeleton
            v-else-if="overview.summaryLoading.value"
            class="orders-page__kpis"
            height="96px"
            data-testid="orders-kpis-skeleton"
        />

        <div class="orders-page__grid">
            <MvPanel title="Orders list">
                <OrdersList
                    ref="list"
                    :pending-approval-order-ids="
                        overview.summary.value?.pendingApprovalOrderIds ?? new Set()
                    "
                />
            </MvPanel>

            <aside class="orders-page__right-stack">
                <MvPanel title="Operational panel">
                    <OperationalPanel :metrics="overview.operationalMetrics.value" />
                </MvPanel>
                <MvPanel title="Attention">
                    <AttentionList :items="overview.attentionItems.value" />
                </MvPanel>
                <MvPanel title="Saved views">
                    <SavedViewsPanel :views="overview.savedViews.value" @select="applySavedView" />
                </MvPanel>
                <MvPanel title="My table views">
                    <MyTableViewsPanel
                        page-key="orders"
                        :current-filters="{ ...(list?.filters ?? BLANK_ORDERS_FILTERS) }"
                        :current-visible-columns="[]"
                        @recall="recallTableView"
                    />
                </MvPanel>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.orders-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
}

.orders-page__context {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.orders-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.orders-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.orders-page__kpis {
    margin-bottom: 18px;
}

.orders-page__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 18px;
    align-items: start;
}

.orders-page__right-stack {
    display: grid;
    gap: 18px;
}

@media (max-width: 1200px) {
    .orders-page__grid {
        grid-template-columns: 1fr;
    }
}
</style>
