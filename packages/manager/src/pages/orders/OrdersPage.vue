<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
    MvKpiCard,
    MvPanel,
    MvWarningBanner,
    MvPagination,
    MvStatusBadge,
    MvFilterChips,
    MvColumnToggle,
    useColumnVisibility,
    type FilterChip,
    type ColumnVisibilityDef,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { adminApi } from '../../api/client';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import {
    DEFAULT_FILTERS,
    fetchOrdersPage,
    fetchOrdersSummary,
    fetchManagerOptions,
    fetchBranchOptions,
    type OrdersFilters,
    type OrderListItem,
    type OrdersSummary,
    type ManagerOption,
    type BranchOption,
} from '../../api/orders';
import OrdersFilterBar from '../../components/orders/OrdersFilterBar.vue';
import OrdersTable from '../../components/orders/OrdersTable.vue';
import AttentionList from '../../components/orders/AttentionList.vue';
import OperationalPanel from '../../components/orders/OperationalPanel.vue';
import SavedViewsPanel, { type SavedView } from '../../components/orders/SavedViewsPanel.vue';

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
const branches = ref<BranchOption[]>([]);
const loading = ref(true);
const departmentName = ref<string | null>(null);

const CHIPS: FilterChip[] = [
    { key: 'all', label: 'All' },
    { key: 'processing', label: 'Processing' },
    { key: 'awaiting-shipment', label: 'Awaiting shipment' },
    { key: 'awaiting-confirmation', label: 'Awaiting confirmation' },
    { key: 'overdue', label: 'Overdue' },
];
const activeChip = ref('all');

// Personal display preference, not business data — see useColumnVisibility's own comment.
// 'code'/'action' are marked required so a manager can never hide the one column they need to
// identify/open a row.
const ORDER_COLUMNS: ColumnVisibilityDef[] = [
    { key: 'code', label: 'Order #', required: true },
    { key: 'customer', label: 'Customer' },
    { key: 'manager', label: 'Manager' },
    { key: 'state', label: 'Status' },
    { key: 'total', label: 'Total amount' },
    { key: 'date', label: 'Date placed' },
    { key: 'branch', label: 'Branch' },
    { key: 'attention', label: 'Attention' },
    { key: 'action', label: '', required: true },
];
const { hiddenKeys: hiddenColumnKeys, toggle: toggleColumn, toggleableColumns } = useColumnVisibility(
    `orders-columns:${authStore.administrator?.id ?? 'anonymous'}`,
    ORDER_COLUMNS,
);

function applyChip(key: string): void {
    activeChip.value = key;
    filters.state = key === 'processing' ? 'PaymentAuthorized' : key === 'awaiting-shipment' ? 'PaymentSettled' : '';
    filters.reservationState = key === 'awaiting-confirmation' ? 'AWAITING_CONFIRMATION' : '';
    page.value = 1;
}

// Chip is UI sugar over the filters themselves — derive it back from a restored filter set (e.g.
// after loading a shared URL) so the highlighted chip matches what's actually being filtered.
// 'overdue' has no filter value of its own (it's a summary-derived view, not a server filter),
// so it can't be round-tripped and always falls back to 'all'.
function chipFromFilters(f: OrdersFilters): string {
    if (f.reservationState === 'AWAITING_CONFIRMATION') return 'awaiting-confirmation';
    if (f.state === 'PaymentAuthorized') return 'processing';
    if (f.state === 'PaymentSettled') return 'awaiting-shipment';
    return 'all';
}

// Manager portal rule (AGENTS.md): every filtered/sorted/paginated view must be a shareable
// URL. useUrlSyncedState reads on mount (below, before the watchers are set up) and writes back
// on every filter/page change via router.replace.
const { fromQuery, toQuery } = useUrlSyncedState(DEFAULT_FILTERS);
fromQuery(filters, page);
activeChip.value = chipFromFilters(filters);

const savedViews = computed<SavedView[]>(() => [
    { key: 'processing', label: 'My processing', count: summary.value?.processingCount ?? 0 },
    { key: 'waiting-approval', label: 'Waiting approval', count: summary.value?.waitingApprovalCount ?? 0 },
    { key: 'today', label: "Today's orders", count: summary.value?.todayCount ?? 0 },
    { key: 'drafts', label: 'Drafts', count: summary.value?.draftCount ?? 0 },
]);

function applySavedView(key: string): void {
    resetFilters();
    if (key === 'processing') filters.state = 'PaymentAuthorized';
    else if (key === 'drafts') filters.state = 'Draft';
    else if (key === 'today') filters.dateRange = 'today';
    // "Waiting approval" has no Order.state of its own — it's derived from
    // pendingPriceAdjustmentOrderIds (see fetchOrdersSummary), which OrdersFilters doesn't
    // support filtering by yet. Resets to an unfiltered list; the Attention column/panel
    // already surfaces these orders individually.
}

async function loadOrders(): Promise<void> {
    const result = await fetchOrdersPage(filters, page.value, pageSize);
    orders.value = result.items;
    totalItems.value = result.totalItems;
}

async function loadAll(): Promise<void> {
    loading.value = true;
    try {
        const [ordersResult, summaryResult, managerOptions, branchOptions] = await Promise.all([
            fetchOrdersPage(filters, page.value, pageSize),
            fetchOrdersSummary(),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
            branches.value.length ? Promise.resolve(branches.value) : fetchBranchOptions(),
        ]);
        orders.value = ordersResult.items;
        totalItems.value = ordersResult.totalItems;
        summary.value = summaryResult;
        managers.value = managerOptions;
        branches.value = branchOptions;
    } finally {
        loading.value = false;
    }

    // Cosmetic (department badge next to the role badge) — kept independent so a failure here
    // never affects the rest of the page (same pattern as DashboardPage.vue).
    try {
        const departmentId = authStore.administrator?.customFields.departmentId;
        const result = await adminApi<{ departments: { erpId: string; name: string }[] }>(
            `query { departments { erpId name } }`,
        );
        // administrator.customFields.departmentId stores the ERP id (see
        // EmployeeService.assign), not Department's DB row id — match on erpId.
        departmentName.value = result.departments.find(d => d.erpId === departmentId)?.name ?? null;
    } catch (e) {
        console.warn('[orders] could not load department name:', e);
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_FILTERS);
    activeChip.value = 'all';
    page.value = 1;
}

watch(page, () => {
    loadOrders();
    toQuery(filters, page);
});
watch(filters, () => {
    page.value = 1;
    loadOrders();
    toQuery(filters, page);
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

const todayAmountFormatted = computed(() => {
    if (!summary.value) return '';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: summary.value.currencyCode,
    }).format(summary.value.todayAmount / 100);
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
            <div class="orders-page__context">
                <MvStatusBadge variant="info">{{ authStore.roleLabel ?? authStore.roleCode }}</MvStatusBadge>
                <MvStatusBadge v-if="departmentName" variant="neutral">{{ departmentName }}</MvStatusBadge>
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
            <MvKpiCard label="Today's amount" :value="todayAmountFormatted" :caption="`${summary.todayCount} orders today`" />
        </div>

        <div class="orders-page__grid">
            <MvPanel title="Orders list">
                <div class="orders-page__panel-actions">
                    <MvColumnToggle :columns="toggleableColumns" @toggle="toggleColumn" />
                </div>
                <OrdersFilterBar
                    :filters="filters"
                    :managers="managers"
                    :show-manager-filter="showManagerColumn"
                    @update:filters="Object.assign(filters, $event)"
                    @reset="resetFilters"
                />
                <MvFilterChips :chips="CHIPS" :active="activeChip" @select="applyChip" />
                <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
                <OrdersTable
                    :orders="orders"
                    :managers="managers"
                    :branches="branches"
                    :show-manager-column="showManagerColumn"
                    :pending-approval-order-ids="summary?.pendingApprovalOrderIds ?? new Set()"
                    :page-size="pageSize"
                    :hidden-column-keys="hiddenColumnKeys"
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
                <MvPanel title="Saved views">
                    <SavedViewsPanel :views="savedViews" @select="applySavedView" />
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

.orders-page__panel-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
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
