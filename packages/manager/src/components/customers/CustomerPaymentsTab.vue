<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLatestRequest, MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import CustomerPaymentsDataTable from './CustomerPaymentsDataTable.vue';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import {
    DEFAULT_PAYMENT_FILTERS,
    fetchPaymentsPage,
    fetchPaymentViewCounts,
    PAYMENT_STATUS_BADGE_VARIANT,
    type PaymentListItem,
    type PaymentViewCounts,
} from '../../api/payments';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — same shape as
// CustomerInvoicesTab.vue. CustomerPaymentsDataTable (built on @mivend/ui-kit's
// MvAdvancedDataTable) renders both desktop and its own built-in mobile card view — no separate
// isMobile branch (or the old PaymentsFilterBar/PaymentsTable mobile fallback) needed here
// anymore (see MvAdvancedMobileCardList.vue in @mivend/ui-kit).
const props = defineProps<{ counterpartyId: string }>();

const authStore = useAuthStore();

const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const payments = ref<PaymentListItem[]>([]);

// Single source of truth for each filter — this ref *is* tableState.filters.status/channel
// inside CustomerPaymentsDataTable, kept in sync via :status-filter/:channel-filter prop down /
// @update:filters emit up (same wiring as CustomerInvoicesTab.vue's statusFilter/searchFilter).
const statusFilter = ref('');
const channelFilter = ref('');
const searchFilter = ref('');

// Curated quick-filter chips — see fetchPaymentViewCounts's own doc comment for why this is 5
// statuses, not all 10 PAYMENT_STATUS_OPTIONS values. variant reuses PAYMENT_STATUS_BADGE_VARIANT
// — the same map the Status column's row badge draws from — so the chip and its row badge can
// never drift into different colors (see MvFilterChips' own doc comment).
type ViewKey = 'all' | 'captured' | 'pending' | 'failed' | 'refunded';
const VIEWS: { key: ViewKey; label: string; variant?: FilterChip['variant'] }[] = [
    { key: 'all', label: 'All' },
    { key: 'captured', label: 'Captured', variant: PAYMENT_STATUS_BADGE_VARIANT.captured },
    { key: 'pending', label: 'Pending', variant: PAYMENT_STATUS_BADGE_VARIANT.pending },
    { key: 'failed', label: 'Failed', variant: PAYMENT_STATUS_BADGE_VARIANT.failed },
    { key: 'refunded', label: 'Refunded', variant: PAYMENT_STATUS_BADGE_VARIANT.refunded },
];
const viewCounts = ref<PaymentViewCounts>({ all: 0, captured: 0, pending: 0, failed: 0, refunded: 0 });
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({ key: v.key, label: `${v.label} ${viewCounts.value[v.key]}`, variant: v.variant })),
);
// Single source of truth for the active view: this ref *is* the `status` filter value, same
// wiring as CustomerInvoicesTab.vue's activeView.
const activeView = computed<ViewKey>({
    get: () => (statusFilter.value || 'all') as ViewKey,
    set: view => {
        statusFilter.value = view === 'all' ? '' : view;
    },
});

// AGENTS.md manager-portal rule: filter/page state must be a shareable URL — see
// CustomerOrdersTab.vue's identical wiring (and its own doc comment on useUrlSyncedState).
interface PaymentUrlFilters {
    [key: string]: string;
    status: string;
    channel: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: PaymentUrlFilters = { status: '', channel: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

function buildUrlFilters(): PaymentUrlFilters {
    return {
        status: statusFilter.value,
        channel: channelFilter.value,
        search: searchFilter.value,
        pageSize: String(pageSize.value),
    };
}

// Applied once, synchronously, before the watchers below are registered — see
// CustomerOrdersTab.vue's identical comment for why.
{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.channel) channelFilter.value = parsed.channel;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

const { loading, run: load } = useLatestRequest(
    () =>
        fetchPaymentsPage(
            {
                ...DEFAULT_PAYMENT_FILTERS,
                status: statusFilter.value,
                channel: channelFilter.value,
                search: searchFilter.value,
                counterpartyId: props.counterpartyId,
            },
            page.value,
            pageSize.value,
        ),
    result => {
        payments.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchPaymentViewCounts(props.counterpartyId);
}

watch([statusFilter, channelFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, statusFilter, channelFilter, searchFilter, pageSize], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

function onDataTableFilters(filters: { status: string; channel: string; search: string }): void {
    statusFilter.value = filters.status;
    channelFilter.value = filters.channel;
    searchFilter.value = filters.search;
}

onMounted(() => {
    void load();
    void loadCounts();
});
</script>

<template>
    <CustomerPaymentsDataTable
        :payments="payments"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        :page-size="pageSize"
        :status-filter="statusFilter"
        :channel-filter="channelFilter"
        :search-filter="searchFilter"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="onDataTableFilters"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @reset-page="page = 1"
    >
        <template #view-chips>
            <MvFilterChips :chips="viewChips" :active="activeView" @select="activeView = $event as ViewKey" />
        </template>
    </CustomerPaymentsDataTable>
</template>
