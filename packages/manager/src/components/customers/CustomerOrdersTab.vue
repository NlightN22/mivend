<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import {
    MvTable,
    MvStatusBadge,
    MvPagination,
    MvColumnToggle,
    useColumnVisibility,
    useIsMobileViewport,
    useLatestRequest,
    type ColumnVisibilityDef,
    type DateRangeFilterValue,
} from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchOrdersPageForCustomer,
    fetchOrderPaymentSummaries,
    fetchCustomerOrderViewCounts,
    type CustomerOrderItem,
    type CustomerOrdersView,
    type CustomerOrderViewCounts,
    type CustomerOrdersExtraFilters,
} from '../../api/customers';
import {
    ORDER_STATE_LABEL,
    ORDER_STATE_BADGE_VARIANT,
    FULFILLMENT_STATE_BADGE_VARIANT,
    FULFILLMENT_STAGE_INDEX,
    FULFILLMENT_STAGE_COUNT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
    fetchManagerOptions,
    type OrderSortField,
    type ManagerOption,
} from '../../api/orders';
import CustomerOrdersDataTable from './CustomerOrdersDataTable.vue';

const isMobile = useIsMobileViewport(800);

const authStore = useAuthStore();

// Personal display preference, not business data — see useColumnVisibility's own comment.
// 'code'/'action'(row-click) aren't in this list since there's no dedicated action column here
// (the whole row is clickable) — 'code' is still required so a customer's order list can't lose
// its one identifying column.
const ORDER_COLUMNS: ColumnVisibilityDef[] = [
    { key: 'code', label: 'Order #', required: true },
    { key: 'state', label: 'Commercial state' },
    { key: 'fulfillment', label: 'Fulfillment' },
    { key: 'payment', label: 'Payment' },
    { key: 'items', label: 'Items' },
    { key: 'total', label: 'Total' },
    { key: 'date', label: 'Date placed' },
    { key: 'placedBy', label: 'Placed by' },
    { key: 'reservation', label: 'Reservation' },
];
const { hiddenKeys: hiddenColumnKeys, toggle: toggleColumn, toggleableColumns } = useColumnVisibility(
    `customer-orders-columns:${authStore.administrator?.id ?? 'anonymous'}`,
    ORDER_COLUMNS,
);

type PaymentLabel = 'Paid' | 'Partially paid' | 'Unpaid';
const PAYMENT_BADGE_VARIANT: Record<PaymentLabel, 'success' | 'warning' | 'neutral'> = {
    Paid: 'success',
    'Partially paid': 'warning',
    Unpaid: 'neutral',
};

// Server-side paginated (AGENTS.md "Pagination" rule) — owns its own fetching, same shape as
// EntityHistoryPanel.vue, rather than receiving a pre-loaded array from CustomerDetailPage.
const props = defineProps<{ customerId: string }>();
const router = useRouter();

const managers = ref<ManagerOption[]>([]);

// Who actually placed this specific order — denormalized server-side at placement time (see
// vendure-config.ts's placedByAdministratorId doc comment) rather than derived per-request from
// the order's first HistoryEntry — this used to fetch/traverse `history` on every page load just
// to answer one question. Null means a storefront customer placed it themselves.
function placedByLabel(order: CustomerOrderItem): string {
    const adminId = order.customFields.placedByAdministratorId;
    if (adminId) {
        const admin = managers.value.find(m => m.id === adminId);
        if (admin) return admin.name;
    }
    if (order.customer) return `${order.customer.firstName} ${order.customer.lastName} (customer)`;
    return '—';
}

// Denormalized server-side (see vendure-config.ts's latestFulfillmentState doc comment) instead
// of derived from the `fulfillments` array on every request — that array is still fetched (see
// CustomerOrderItem's own doc comment) only for the progress-bar computation below.
function fulfillmentLabel(order: CustomerOrderItem): string {
    return order.customFields.latestFulfillmentState ?? 'Not started';
}

// Real column now (see CustomerOrdersDataTable.vue) — was previously an orphaned toolbar filter
// with no corresponding data shown anywhere in the table.
function reservationLabel(order: CustomerOrderItem): string {
    const raw = order.customFields.reservationState;
    if (!raw) return 'None';
    return ORDER_RESERVATION_STATE_OPTIONS.find(o => o.value === raw)?.label ?? raw;
}

// Stage position in the fulfillment sequence (Not started -> Pending -> Shipped -> Delivered),
// not a quantity-fulfilled ratio — see FULFILLMENT_STAGE_INDEX's doc comment (api/orders.ts) for
// the real bug this replaced: a quantity ratio hits 100% the moment a single Fulfillment record
// exists covering all lines, regardless of whether that fulfillment is still Pending or already
// Delivered, so every non-empty order rendered a fully-filled bar. 'Cancelled' has no defined
// stage — render it as empty rather than guessing a position for a terminal, off-sequence state.
function fulfillmentProgress(order: CustomerOrderItem): number {
    const state = fulfillmentLabel(order);
    const index = FULFILLMENT_STAGE_INDEX[state];
    if (index === undefined) return 0;
    return Math.round((index / FULFILLMENT_STAGE_COUNT) * 100);
}

const pageSize = ref(20);
const page = ref(1);
// Desktop-only (CustomerOrdersDataTable.vue) sort/filter state — mobile's simpler card view
// doesn't expose these controls, matching the main Orders page's own mobile/desktop split.
const sort = ref<Partial<Record<OrderSortField, 'ASC' | 'DESC'>>>({ createdAt: 'DESC' });
const stateFilter = ref<string[]>([]);
const reservationStateFilter = ref('');
const dateRangeFilter = ref<DateRangeFilterValue>({ preset: '', from: '', to: '' });
const codeFilter = ref('');
const fulfillmentStateFilter = ref<string[]>([]);
const placedByFilter = ref('');
const totalMinFilter = ref<number | undefined>(undefined);
const totalMaxFilter = ref<number | undefined>(undefined);
const totalItems = ref(0);
const orders = ref<CustomerOrderItem[]>([]);
const paymentSummaries = ref<Map<string, number>>(new Map());

// Segmented quick filters — each is a real, separately server-paginated query (see
// fetchOrdersPageForCustomer in api/customers.ts), not a client-side filter over one loaded
// page. Counts come from a single lean query (fetchCustomerOrderViewCounts) and don't change as
// you paginate, since they're real totals from the server, not derived from whatever page is
// currently loaded.
type ViewKey = CustomerOrdersView;
const activeView = ref<ViewKey>('all');
const VIEWS: { key: ViewKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'partial', label: 'Partially paid' },
    { key: 'cancelled', label: 'Cancelled' },
];
const viewCounts = ref<CustomerOrderViewCounts>({ all: 0, unpaid: 0, partial: 0, cancelled: 0 });

// Paid/Partially paid/Unpaid — compares the real captured total (see fetchOrderPaymentSummaries)
// against the order's own totalWithTax. Deliberately simple (no refund netting yet, see
// api/customers.ts's comment) — matches what the badge needs to answer: "did the money that's
// supposed to be here actually arrive."
function paymentLabel(order: CustomerOrderItem): PaymentLabel {
    const captured = paymentSummaries.value.get(order.id) ?? 0;
    if (captured <= 0) return 'Unpaid';
    if (captured < order.totalWithTax) return 'Partially paid';
    return 'Paid';
}

function buildExtraFilters(): CustomerOrdersExtraFilters {
    return {
        state: stateFilter.value,
        reservationState: reservationStateFilter.value,
        dateFrom: dateRangeFilter.value.from || undefined,
        dateTo: dateRangeFilter.value.to || undefined,
        code: codeFilter.value || undefined,
        fulfillmentState: fulfillmentStateFilter.value,
        placedByAdministratorId: placedByFilter.value || undefined,
        totalMin: totalMinFilter.value,
        totalMax: totalMaxFilter.value,
    };
}

// useLatestRequest guards against an out-of-order network response overwriting fresher state —
// see its own doc comment (@mivend/ui-kit) for the real incident this fixes (PrimeVue's paginator
// doesn't disable itself mid-fetch, so a second page-change can start a new fetch before the
// first one's response resolves; over real network latency, whichever response arrives *last*
// wins by default, not whichever was requested last). The payment-summary lookup is folded into
// the same fetcher (not a separate `await` after applying the order page) so it's covered by the
// same guard as one atomic unit — a second, independent `await` outside the fetcher wouldn't be.
const { loading, run: load } = useLatestRequest(
    async () => {
        const result = await fetchOrdersPageForCustomer(
            props.customerId,
            page.value,
            pageSize.value,
            activeView.value,
            sort.value,
            buildExtraFilters(),
        );
        const summaries = await fetchOrderPaymentSummaries(result.items.map(o => o.id));
        return { result, summaries };
    },
    ({ result, summaries }) => {
        orders.value = result.items;
        totalItems.value = result.totalItems;
        paymentSummaries.value = summaries;
    },
);

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchCustomerOrderViewCounts(props.customerId);
}

// Switching views resets to page 1; the combined watcher below fires exactly once per settled
// (page, view) pair either way (Vue batches synchronous ref writes within one reactive flush).
const filterRefs = [
    activeView,
    stateFilter,
    reservationStateFilter,
    dateRangeFilter,
    codeFilter,
    fulfillmentStateFilter,
    placedByFilter,
    totalMinFilter,
    totalMaxFilter,
    pageSize,
] as const;
watch(filterRefs, () => {
    page.value = 1;
});
watch([page, sort, ...filterRefs], () => void load());

onMounted(() => {
    void load();
    void loadCounts();
    fetchManagerOptions().then(result => {
        managers.value = result;
    });
});

function handleSortChange(next: typeof sort.value): void {
    sort.value = next;
}
interface CustomerOrdersFilterValues {
    state: string[];
    reservationState: string;
    dateRange: DateRangeFilterValue;
    code: string;
    fulfillmentState: string[];
    placedByAdministratorId: string;
    totalMin: number | undefined;
    totalMax: number | undefined;
}
function handleFiltersChange(next: CustomerOrdersFilterValues): void {
    stateFilter.value = next.state;
    reservationStateFilter.value = next.reservationState;
    dateRangeFilter.value = next.dateRange;
    codeFilter.value = next.code;
    fulfillmentStateFilter.value = next.fulfillmentState;
    placedByFilter.value = next.placedByAdministratorId;
    totalMinFilter.value = next.totalMin;
    totalMaxFilter.value = next.totalMax;
}
function handlePageChange(next: number): void {
    page.value = next;
}
function handlePageSizeChange(next: number): void {
    pageSize.value = next;
}

function money(order: CustomerOrderItem): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currencyCode }).format(
        order.totalWithTax / 100,
    );
}

function openOrder(code: string): void {
    router.push(`/orders/${code}`);
}

// MvTable renders this same column config as mobile cards below its own breakpoint (see
// MvTable.vue) — no separate hand-written mobile column set needed.
const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
    { key: 'code', title: 'Order #', dataKey: 'code', width: 190, mobile: { primary: true } },
    {
        key: 'state',
        title: 'Commercial state',
        dataKey: 'state',
        width: 150,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(MvStatusBadge, { variant: row.stateVariant as StatusBadgeVariant }, () => row.state as string);
        },
        mobile: { badge: true },
    },
    {
        key: 'fulfillment',
        title: 'Fulfillment',
        dataKey: 'fulfillment',
        width: 160,
        // Inline styles, not a scoped CSS class — Vue's `scoped` CSS only instruments elements
        // compiled from this file's own <template>, not VNodes built imperatively via h() in a
        // cellRenderer, so a scoped class here would silently never apply (real bug caught by
        // inspecting computed styles: the progress bar's height came back 0px).
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                h(
                    MvStatusBadge,
                    { variant: row.fulfillmentVariant as StatusBadgeVariant },
                    () => row.fulfillment as string,
                ),
                h(
                    'div',
                    {
                        style: {
                            width: '108px',
                            height: '6px',
                            background: 'var(--el-fill-color-light, #edf1f4)',
                            borderRadius: '999px',
                            overflow: 'hidden',
                        },
                    },
                    [
                        h('span', {
                            style: {
                                display: 'block',
                                height: '100%',
                                width: `${row.fulfillmentProgress as number}%`,
                                background: 'var(--el-color-primary, #00b894)',
                            },
                        }),
                    ],
                ),
            ]);
        },
    },
    {
        key: 'payment',
        title: 'Payment',
        dataKey: 'payment',
        width: 140,
        cellRenderer: ({ rowData }) => {
            const label = (rowData as TableRow).payment as PaymentLabel;
            return h(MvStatusBadge, { variant: PAYMENT_BADGE_VARIANT[label] }, () => label);
        },
    },
    { key: 'items', title: 'Items', dataKey: 'items', width: 90, align: 'right' },
    { key: 'total', title: 'Total', dataKey: 'total', width: 130, align: 'right' },
    { key: 'date', title: 'Date placed', dataKey: 'date', width: 140, mobile: { hidden: true } },
    { key: 'placedBy', title: 'Placed by', dataKey: 'placedBy', width: 170, mobile: { hidden: true } },
    {
        key: 'reservation',
        title: 'Reservation',
        dataKey: 'reservation',
        width: 150,
        mobile: { hidden: true },
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(MvStatusBadge, { variant: row.reservationVariant as StatusBadgeVariant }, () => row.reservation as string);
        },
    },
    ];
    if (!hiddenColumnKeys.value.size) return cols;
    return cols.filter(c => !hiddenColumnKeys.value.has(c.key as string));
});

const rows = computed(() =>
    orders.value.map(order => ({
        code: order.code,
        state: ORDER_STATE_LABEL[order.state] ?? order.state,
        stateVariant: ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral',
        fulfillment: fulfillmentLabel(order),
        fulfillmentVariant: FULFILLMENT_STATE_BADGE_VARIANT[fulfillmentLabel(order)] ?? 'neutral',
        fulfillmentProgress: fulfillmentProgress(order),
        payment: paymentLabel(order),
        paymentVariant: PAYMENT_BADGE_VARIANT[paymentLabel(order)],
        items: String(order.totalQuantity),
        total: money(order),
        // Real ISO code, not just the pre-formatted `total` string — CustomerOrdersDataTable's
        // Total filter needs the raw code to derive the currency symbol via Intl (see AGENTS.md
        // "business data must live in the database": never hardcode a currency symbol).
        currencyCode: order.currencyCode,
        date: new Date(order.createdAt).toLocaleDateString('en-US'),
        placedBy: placedByLabel(order),
        reservation: reservationLabel(order),
        reservationVariant: ORDER_RESERVATION_STATE_BADGE_VARIANT[order.customFields.reservationState ?? ''] ?? 'neutral',
    })),
);
</script>

<template>
    <div v-if="isMobile" class="customer-orders__toolbar">
        <div class="customer-orders__views">
            <button
                v-for="view in VIEWS"
                :key="view.key"
                type="button"
                class="customer-orders__view-chip"
                :class="{ 'customer-orders__view-chip--active': activeView === view.key }"
                @click="activeView = view.key"
            >
                {{ view.label }} {{ viewCounts[view.key] }}
            </button>
        </div>
        <MvColumnToggle :columns="toggleableColumns" @toggle="toggleColumn" />
    </div>

    <template v-if="isMobile">
        <!-- Same top+bottom MvPagination pattern as OrdersPage.vue — a long list shouldn't
             require scrolling all the way down just to reach the Next button. -->
        <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />

        <MvTable
            :columns="columns"
            :data="rows"
            :height="Math.max(rows.length, pageSize) * 52 + 40"
            :loading="loading"
            empty-text="No orders yet"
            @row-click="({ rowData }) => openOrder((rowData as TableRow).code as string)"
        />
        <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
    </template>
    <CustomerOrdersDataTable
        v-else
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page-size="pageSize"
        :managers="managers"
        :state-filter="stateFilter"
        :reservation-state-filter="reservationStateFilter"
        :date-range-filter="dateRangeFilter"
        :code-filter="codeFilter"
        :fulfillment-state-filter="fulfillmentStateFilter"
        :placed-by-filter="placedByFilter"
        :total-min-filter="totalMinFilter"
        :total-max-filter="totalMaxFilter"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        :payment-view-prop="activeView"
        @update:sort="handleSortChange"
        @update:filters="handleFiltersChange"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
        @update:payment-view="activeView = $event"
        @reset-page="page = 1"
    >
        <template #view-chips>
            <button
                v-for="view in VIEWS"
                :key="view.key"
                type="button"
                class="customer-orders__view-chip"
                :class="{ 'customer-orders__view-chip--active': activeView === view.key }"
                @click="activeView = view.key"
            >
                {{ view.label }} {{ viewCounts[view.key] }}
            </button>
        </template>
    </CustomerOrdersDataTable>
</template>

<style scoped>
.customer-orders__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
}

.customer-orders__views {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.customer-orders__view-chip {
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    color: var(--el-text-color-secondary, #6b7280);
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
}

.customer-orders__view-chip:hover {
    border-color: var(--el-text-color-secondary, #9ca3af);
}

.customer-orders__view-chip--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    border-color: #bcebdd;
    color: var(--el-color-primary-dark-2, #008a70);
}
</style>
