<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLatestRequest, MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import CustomerInvoicesDataTable from './CustomerInvoicesDataTable.vue';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import {
    fetchInvoicesPage,
    fetchInvoiceViewCounts,
    DEFAULT_INVOICE_FILTERS,
    INVOICE_STATUS_BADGE_VARIANT,
    type InvoiceListItem,
    type InvoiceViewCounts,
} from '../../api/invoices';

// Server-side paginated + filtered (the backend-plugin-rules skill's "Pagination" rule) — owns its own fetching, same
// shape as CustomerOrdersTab.vue. CustomerInvoicesDataTable (built on @mivend/ui-kit's
// MvAdvancedDataTable) renders both desktop and its own built-in mobile card view — no separate
// isMobile branch needed here anymore (see MvAdvancedMobileCardList.vue in @mivend/ui-kit).
const props = defineProps<{ counterpartyId: string }>();

const authStore = useAuthStore();

// Reactive, not a hardcoded constant — must track whatever page size the user actually picked
// in the table's own rows-per-page dropdown (10/20/50), or `load()` below keeps fetching a fixed
// chunk size regardless of what's displayed, desyncing the paginator's page math from what the
// server actually returns (see CustomerOrdersTab.vue's identical `pageSize` ref for the pattern
// this mirrors — this file originally hardcoded a hardcoded `PAGE_SIZE` and stubbed
// `@update:page-size` as a no-op, the real bug behind "page 3 of 5 is empty").
const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const invoices = ref<InvoiceListItem[]>([]);

type ViewKey = 'all' | 'pending' | 'issued' | 'paid' | 'cancelled';
// variant reuses INVOICE_STATUS_BADGE_VARIANT — the same map CustomerInvoicesDataTable.vue's
// status-column badge draws from — so the quick-filter chip and the row badge for the same
// status can never drift into different colors (see MvFilterChips' own doc comment).
const VIEWS: { key: ViewKey; label: string; variant?: FilterChip['variant'] }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending', variant: INVOICE_STATUS_BADGE_VARIANT.pending },
    { key: 'issued', label: 'Issued', variant: INVOICE_STATUS_BADGE_VARIANT.issued },
    { key: 'paid', label: 'Paid', variant: INVOICE_STATUS_BADGE_VARIANT.paid },
    { key: 'cancelled', label: 'Cancelled', variant: INVOICE_STATUS_BADGE_VARIANT.cancelled },
];
const viewCounts = ref<InvoiceViewCounts>({ all: 0, pending: 0, issued: 0, paid: 0, cancelled: 0 });
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({ key: v.key, label: `${v.label} ${viewCounts.value[v.key]}`, variant: v.variant })),
);

// Single source of truth for the active view: this ref *is* the `status` filter value (mirrors
// the table's own tableState.filters.status one-for-one, kept in sync via the
// :status-filter prop down / @update:filters emit up — see CustomerInvoicesDataTable.vue), never
// a second, independently-tracked "which chip is active" ref that could desync from what's
// actually being fetched.
const statusFilter = ref<string>('');
// The table's own base-column search (Invoice #) — same single-source-of-truth wiring as
// statusFilter: this ref *is* tableState.filters.id inside CustomerInvoicesDataTable, kept in
// sync via :search-filter prop down / @update:filters emit up.
const searchFilter = ref<string>('');
const activeView = computed<ViewKey>({
    get: () => (statusFilter.value || 'all') as ViewKey,
    set: view => {
        statusFilter.value = view === 'all' ? '' : view;
    },
});

// Manager-portal rule (manager-portal-rules skill): filter/page state must be a shareable URL — see
// CustomerOrdersTab.vue's identical wiring (and its own doc comment on useUrlSyncedState) for the
// full reasoning. This tab's filter set is small (status, id search), so no array/object
// flattening is needed beyond pageSize.
interface InvoiceUrlFilters {
    [key: string]: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: InvoiceUrlFilters = { status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

function buildUrlFilters(): InvoiceUrlFilters {
    return { status: statusFilter.value, search: searchFilter.value, pageSize: String(pageSize.value) };
}

// Applied once, synchronously, before the watchers below are registered — see
// CustomerOrdersTab.vue's identical comment for why (avoids a wasted extra load() from the
// watchers firing on these initial ref writes).
{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

// useLatestRequest guards against an out-of-order network response overwriting fresher state —
// see its own doc comment (@mivend/ui-kit) for the real incident this fixes (PrimeVue's paginator
// doesn't disable itself mid-fetch, so a second page-change can start a new fetch before the
// first one's response resolves; over real network latency, whichever response arrives *last*
// wins by default, not whichever was requested last).
const { loading, run: load } = useLatestRequest(
    () =>
        fetchInvoicesPage(
            {
                ...DEFAULT_INVOICE_FILTERS,
                status: statusFilter.value,
                search: searchFilter.value,
                counterpartyId: props.counterpartyId,
            },
            page.value,
            pageSize.value,
        ),
    result => {
        invoices.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchInvoiceViewCounts(props.counterpartyId);
}

watch([statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, statusFilter, searchFilter, pageSize], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

function onDataTableFilters(filters: { status: string; search: string }): void {
    statusFilter.value = filters.status;
    searchFilter.value = filters.search;
}

onMounted(() => {
    void load();
    void loadCounts();
});
</script>

<template>
    <CustomerInvoicesDataTable
        :invoices="invoices"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        :page-size="pageSize"
        :status-filter="statusFilter"
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
    </CustomerInvoicesDataTable>
</template>
