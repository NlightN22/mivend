<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLatestRequest, MvFilterChips, type DateRangeFilterValue, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
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

const authStore = useAuthStore();

type PaymentLabel = 'Paid' | 'Partially paid' | 'Unpaid';
const PAYMENT_BADGE_VARIANT: Record<PaymentLabel, 'success' | 'warning' | 'neutral'> = {
    Paid: 'success',
    'Partially paid': 'warning',
    Unpaid: 'neutral',
};

// Server-side paginated (AGENTS.md "Pagination" rule) — owns its own fetching, same shape as
// EntityHistoryPanel.vue, rather than receiving a pre-loaded array from CustomerDetailPage.
const props = defineProps<{ customerId: string }>();

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
// variant reuses PAYMENT_BADGE_VARIANT/ORDER_STATE_BADGE_VARIANT — the same maps the Payment/
// Commercial-state row badges draw from — so the quick-filter chip and its row badge can never
// drift into different colors (see MvFilterChips' own doc comment).
const VIEWS: { key: ViewKey; label: string; variant?: FilterChip['variant'] }[] = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Unpaid', variant: PAYMENT_BADGE_VARIANT.Unpaid },
    { key: 'partial', label: 'Partially paid', variant: PAYMENT_BADGE_VARIANT['Partially paid'] },
    { key: 'cancelled', label: 'Cancelled', variant: ORDER_STATE_BADGE_VARIANT.Cancelled },
];
const viewCounts = ref<CustomerOrderViewCounts>({ all: 0, unpaid: 0, partial: 0, cancelled: 0 });
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({ key: v.key, label: `${v.label} ${viewCounts.value[v.key]}`, variant: v.variant })),
);

// AGENTS.md manager-portal rule: every filter/sort/page-controlled list must be a shareable URL.
// useUrlSyncedState only accepts a flat Record<string,string>, so every non-string ref above
// (arrays, the dateRange object, numbers, the sort object) is flattened into/out of this shape —
// same reasoning as OrdersPage.vue's own OrdersFilters, just with more fields since this tab has
// more filter controls than the top-level Orders page.
interface CustomerOrdersUrlFilters {
    [key: string]: string;
    view: string;
    state: string;
    reservationState: string;
    dateFrom: string;
    dateTo: string;
    datePreset: string;
    code: string;
    fulfillmentState: string;
    placedBy: string;
    totalMin: string;
    totalMax: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: CustomerOrdersUrlFilters = {
    view: 'all',
    state: '',
    reservationState: '',
    dateFrom: '',
    dateTo: '',
    datePreset: '',
    code: '',
    fulfillmentState: '',
    placedBy: '',
    totalMin: '',
    totalMax: '',
    sortField: 'createdAt',
    sortDir: 'DESC',
    pageSize: '20',
};
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

function buildUrlFilters(): CustomerOrdersUrlFilters {
    const [sortField, sortDir] = Object.entries(sort.value)[0] ?? ['createdAt', 'DESC'];
    return {
        view: activeView.value,
        state: stateFilter.value.join(','),
        reservationState: reservationStateFilter.value,
        dateFrom: dateRangeFilter.value.from,
        dateTo: dateRangeFilter.value.to,
        datePreset: dateRangeFilter.value.preset,
        code: codeFilter.value,
        fulfillmentState: fulfillmentStateFilter.value.join(','),
        placedBy: placedByFilter.value,
        totalMin: totalMinFilter.value !== undefined ? String(totalMinFilter.value) : '',
        totalMax: totalMaxFilter.value !== undefined ? String(totalMaxFilter.value) : '',
        sortField,
        sortDir: sortDir ?? 'DESC',
        pageSize: String(pageSize.value),
    };
}

// Applied once, synchronously, before the watchers below are registered — so restoring state
// from the URL doesn't itself trigger an extra load() via those watchers (mirrors OrdersPage.vue
// calling fromQuery before its own watch/loadOrders setup).
{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.view) activeView.value = parsed.view as ViewKey;
    if (parsed.state) stateFilter.value = parsed.state.split(',').filter(Boolean);
    if (parsed.reservationState) reservationStateFilter.value = parsed.reservationState;
    if (parsed.dateFrom || parsed.dateTo || parsed.datePreset) {
        dateRangeFilter.value = { preset: parsed.datePreset, from: parsed.dateFrom, to: parsed.dateTo };
    }
    if (parsed.code) codeFilter.value = parsed.code;
    if (parsed.fulfillmentState) fulfillmentStateFilter.value = parsed.fulfillmentState.split(',').filter(Boolean);
    if (parsed.placedBy) placedByFilter.value = parsed.placedBy;
    if (parsed.totalMin) totalMinFilter.value = Number(parsed.totalMin);
    if (parsed.totalMax) totalMaxFilter.value = Number(parsed.totalMax);
    if (parsed.sortField) sort.value = { [parsed.sortField]: (parsed.sortDir || 'DESC') as 'ASC' | 'DESC' };
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

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
watch([page, sort, ...filterRefs], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

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

// CustomerOrdersDataTable renders this same row shape on both desktop (PrimeVue DataTable) and
// mobile (MvAdvancedDataTable's own built-in card view, driven by each column's `mobile` hint) —
// no separate hand-written mobile row/column set needed (see MvAdvancedMobileCardList.vue in
// @mivend/ui-kit).
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
        // Raw ISO timestamp, not pre-formatted — CustomerOrdersDataTable's #cell-date slot
        // renders it via MvDateTimeCell (date + a smaller time-of-day line), which needs the
        // real value to format both parts.
        date: order.createdAt,
        placedBy: placedByLabel(order),
        reservation: reservationLabel(order),
        reservationVariant: ORDER_RESERVATION_STATE_BADGE_VARIANT[order.customFields.reservationState ?? ''] ?? 'neutral',
    })),
);
</script>

<template>
    <CustomerOrdersDataTable
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
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
            <MvFilterChips :chips="viewChips" :active="activeView" @select="activeView = $event as ViewKey" />
        </template>
    </CustomerOrdersDataTable>
</template>
