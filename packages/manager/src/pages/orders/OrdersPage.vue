<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { MvKpiCard, MvPanel, MvWarningBanner, MvPagination } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    DEFAULT_FILTERS,
    fetchOrdersPage,
    fetchOrdersSummary,
    fetchManagerOptions,
    type OrdersFilters,
    type OrderListItem,
    type OrdersSummary,
    type ManagerOption,
} from '../../api/orders';
import OrdersFilterBar from '../../components/orders/OrdersFilterBar.vue';
import OrdersTable from '../../components/orders/OrdersTable.vue';
import AttentionList from '../../components/orders/AttentionList.vue';
import OperationalPanel from '../../components/orders/OperationalPanel.vue';
import SavedFilterChips, { type FilterChip } from '../../components/SavedFilterChips.vue';

const authStore = useAuthStore();

// Operator/Dept Head/Director/SB see multiple managers' orders; Manager always sees only their
// own, so the column/filter would be redundant (see docs/ai/manager-portal-pages/02-orders-list.md).
const showManagerColumn = computed(() => authStore.roleCode !== 'manager');

const filters = reactive<OrdersFilters>({ ...DEFAULT_FILTERS });
const page = ref(1);
const pageSize = 10;

const orders = ref<OrderListItem[]>([]);
const totalItems = ref(0);
const summary = ref<OrdersSummary | null>(null);
const managers = ref<ManagerOption[]>([]);
const loading = ref(true);

const CHIPS: FilterChip[] = [
    { key: 'all', label: 'All' },
    { key: 'processing', label: 'Processing' },
    { key: 'awaiting-shipment', label: 'Awaiting shipment' },
    { key: 'overdue', label: 'Overdue' },
];
const activeChip = ref('all');

function applyChip(key: string): void {
    activeChip.value = key;
    filters.state = key === 'processing' ? 'PaymentAuthorized' : key === 'awaiting-shipment' ? 'PaymentSettled' : '';
    page.value = 1;
}

async function loadOrders(): Promise<void> {
    const result = await fetchOrdersPage(filters, page.value, pageSize);
    orders.value = result.items;
    totalItems.value = result.totalItems;
}

async function loadAll(): Promise<void> {
    loading.value = true;
    try {
        const [ordersResult, summaryResult, managerOptions] = await Promise.all([
            fetchOrdersPage(filters, page.value, pageSize),
            fetchOrdersSummary(),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
        ]);
        orders.value = ordersResult.items;
        totalItems.value = ordersResult.totalItems;
        summary.value = summaryResult;
        managers.value = managerOptions;
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_FILTERS);
    activeChip.value = 'all';
    page.value = 1;
}

watch(page, () => loadOrders());
watch(filters, () => {
    page.value = 1;
    loadOrders();
});

onMounted(loadAll);

const attentionItems = computed(
    () =>
        summary.value?.attentionCandidates.slice(0, 5).map(c => ({
            code: c.code,
            title: `${c.code} ${c.state === 'PaymentSettled' ? 'shipment overdue' : 'price limit exceeded'}`,
            meta: `${c.customerName}`,
        })) ?? [],
);

const operationalMetrics = computed(() => {
    if (!summary.value) return [];
    return [
        { label: 'Open orders', value: String(summary.value.openCount) },
        { label: 'Waiting approval', value: String(summary.value.waitingApprovalCount) },
        { label: 'Overdue', value: String(summary.value.overdueCount) },
        {
            label: 'Open orders amount',
            value: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: summary.value.currencyCode,
            }).format(summary.value.totalAmount / 100),
        },
    ];
});
</script>

<template>
    <div class="orders-page">
        <div class="orders-page__header">
            <div>
                <div class="orders-page__breadcrumb">Workspace / Orders</div>
                <h1 class="orders-page__title">Orders</h1>
                <p class="orders-page__subtitle">{{ totalItems }} orders across your accessible scope.</p>
            </div>
        </div>

        <MvWarningBanner
            v-if="summary && summary.attentionCandidates.length"
            action-text="Open problem orders"
            action-to="/orders"
        >
            <strong>{{ summary.attentionCandidates.length }} orders need attention.</strong>
            Some are overdue for shipment or have a price adjustment awaiting approval.
        </MvWarningBanner>

        <div v-if="summary" class="orders-page__kpis">
            <MvKpiCard label="Open orders" :value="summary.openCount" />
            <MvKpiCard label="Waiting approval" :value="summary.waitingApprovalCount" accent />
            <MvKpiCard label="Overdue" :value="summary.overdueCount" accent />
            <MvKpiCard label="Today's orders" :value="summary.todayCount" />
        </div>

        <div class="orders-page__grid">
            <MvPanel title="Orders list">
                <SavedFilterChips :chips="CHIPS" :active="activeChip" @select="applyChip" />
                <OrdersFilterBar
                    :filters="filters"
                    :managers="managers"
                    :show-manager-filter="showManagerColumn"
                    @update:filters="Object.assign(filters, $event)"
                    @reset="resetFilters"
                />
                <OrdersTable
                    :orders="orders"
                    :managers="managers"
                    :show-manager-column="showManagerColumn"
                    :pending-approval-order-ids="summary?.pendingApprovalOrderIds ?? new Set()"
                />
                <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
            </MvPanel>

            <aside class="orders-page__right-stack">
                <MvPanel title="Operational panel">
                    <OperationalPanel :metrics="operationalMetrics" />
                </MvPanel>
                <MvPanel title="Attention">
                    <AttentionList :items="attentionItems" />
                </MvPanel>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.orders-page__header {
    margin-bottom: 18px;
}

.orders-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.orders-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.orders-page__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.orders-page__kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
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
    .orders-page__kpis {
        grid-template-columns: repeat(2, 1fr);
    }

    .orders-page__grid {
        grid-template-columns: 1fr;
    }
}
</style>
