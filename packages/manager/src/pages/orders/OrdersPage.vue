<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
    MvKpiCard,
    MvKpiCarousel,
    MvPanel,
    MvWarningBanner,
    MvPagination,
    MvStatusBadge,
    MvDataTableToolbar,
    useColumnVisibility,
    toColumnVisibilityDefs,
    type FilterChip,
    type MvDataTableColumn,
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
    ORDER_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_OPTIONS,
    DATE_RANGE_OPTIONS,
    type OrdersFilters,
    type OrderListItem,
    type OrdersSummary,
    type ManagerOption,
    type BranchOption,
} from '../../api/orders';
import OrdersTableResponsive from '../../components/orders/OrdersTableResponsive.vue';
import AttentionList from '../../components/orders/AttentionList.vue';
import OperationalPanel from '../../components/orders/OperationalPanel.vue';
import SavedViewsPanel, { type SavedView } from '../../components/orders/SavedViewsPanel.vue';
import MyTableViewsPanel from '../../components/orders/MyTableViewsPanel.vue';
import type { SavedTableView } from '../../api/orders';

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

// Single source of truth for this table's toolbar (AGENTS.md/MvDataTableToolbar consolidation —
// replaces the old separate ORDER_COLUMNS/OrdersFilterBar-fields/CHIPS trio). Entries with no
// matching visible column (search/reservationState/dateRange/managerId — OrdersTable.vue has no
// such columns) are marked `required` too so they're excluded from the Columns toggle, which
// only makes sense for entries that ARE real display columns. 'code'/'action' are marked
// required for the usual reason: a manager can never hide the one column they need to
// identify/open a row.
const ORDER_TABLE_COLUMNS = computed<MvDataTableColumn[]>(() => {
    const cols: MvDataTableColumn[] = [
        { key: 'search', title: 'Search', required: true, filter: { kind: 'search', placeholder: 'Order number, customer...' } },
        { key: 'code', title: 'Order #', required: true },
        { key: 'customer', title: 'Customer' },
    ];
    if (showManagerColumn.value) {
        cols.push({ key: 'manager', title: 'Manager' });
        cols.push({
            key: 'managerId',
            title: 'Manager filter',
            required: true,
            filter: {
                kind: 'select',
                options: [{ value: '', label: 'All managers' }, ...managers.value.map(m => ({ value: m.id, label: m.name }))],
            },
        });
    }
    cols.push(
        { key: 'state', title: 'Status', filter: { kind: 'select', options: [...ORDER_STATE_OPTIONS] } },
        {
            key: 'reservationState',
            title: 'Reservation',
            required: true,
            filter: { kind: 'select', options: [...ORDER_RESERVATION_STATE_OPTIONS] },
        },
        { key: 'dateRange', title: 'Date range', required: true, filter: { kind: 'select', options: [...DATE_RANGE_OPTIONS] } },
        { key: 'total', title: 'Total amount' },
        { key: 'date', title: 'Date placed' },
        { key: 'branch', title: 'Branch' },
        { key: 'attention', title: 'Attention' },
        { key: 'action', title: '', required: true },
    );
    return cols;
});
const { hiddenKeys: hiddenColumnKeys, toggle: toggleColumn } = useColumnVisibility(
    `orders-columns:${authStore.administrator?.id ?? 'anonymous'}`,
    toColumnVisibilityDefs(ORDER_TABLE_COLUMNS.value),
);
const HIDEABLE_COLUMN_KEYS = computed(() => ORDER_TABLE_COLUMNS.value.filter(c => !c.required).map(c => c.key));

function applyMyTableView(view: SavedTableView): void {
    const restoredFilters = JSON.parse(view.filters) as Partial<OrdersFilters>;
    Object.assign(filters, DEFAULT_FILTERS, restoredFilters);
    activeChip.value = chipFromFilters(filters);
    hiddenColumnKeys.value = new Set(
        HIDEABLE_COLUMN_KEYS.value.filter(key => !view.visibleColumns.includes(key)),
    );
    page.value = 1;
}

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

// Set by OrdersDataTable.vue's (desktop-only) column sort — see api/orders.ts's
// OrderSortField/fetchOrdersPage doc comment for why only these 4 fields are real.
const sort = ref<Partial<Record<'code' | 'state' | 'totalWithTax' | 'orderPlacedAt', 'ASC' | 'DESC'>>>({
    orderPlacedAt: 'DESC',
});
function handleSortChange(next: typeof sort.value): void {
    sort.value = next;
    void loadOrders();
}

async function loadOrders(): Promise<void> {
    const result = await fetchOrdersPage(filters, page.value, pageSize, sort.value);
    orders.value = result.items;
    totalItems.value = result.totalItems;
}

async function loadAll(): Promise<void> {
    loading.value = true;
    try {
        const [ordersResult, summaryResult, managerOptions, branchOptions] = await Promise.all([
            fetchOrdersPage(filters, page.value, pageSize, sort.value),
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

        <MvKpiCarousel v-if="summary" class="orders-page__kpis">
            <MvKpiCard label="Open orders" :value="summary.openCount" />
            <MvKpiCard label="Waiting approval" :value="summary.waitingApprovalCount" accent />
            <MvKpiCard label="Today's amount" :value="todayAmountFormatted" :caption="`${summary.todayCount} orders today`" />
        </MvKpiCarousel>

        <div class="orders-page__grid">
            <MvPanel title="Orders list">
                <MvDataTableToolbar
                    :columns="ORDER_TABLE_COLUMNS"
                    :filters="filters"
                    :hidden-column-keys="hiddenColumnKeys"
                    :chips="CHIPS"
                    :active-chip="activeChip"
                    @update:filters="Object.assign(filters, $event)"
                    @reset="resetFilters"
                    @toggle-column="toggleColumn"
                    @select-chip="applyChip"
                    hide-column-toggle
                />
                <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
                <OrdersTableResponsive
                    :orders="orders"
                    :managers="managers"
                    :branches="branches"
                    :show-manager-column="showManagerColumn"
                    :pending-approval-order-ids="summary?.pendingApprovalOrderIds ?? new Set()"
                    :loading="loading"
                    :total-items="totalItems"
                    :page-size="pageSize"
                    :state-filter="filters.state"
                    :administrator-id="authStore.administrator?.id ?? 'anonymous'"
                    @update:sort="handleSortChange"
                    @update:state-filter="filters.state = $event"
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
                <MvPanel title="My table views">
                    <MyTableViewsPanel
                        page-key="orders"
                        :current-filters="filters"
                        :current-visible-columns="HIDEABLE_COLUMN_KEYS.filter(k => !hiddenColumnKeys.has(k))"
                        @recall="applyMyTableView"
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
