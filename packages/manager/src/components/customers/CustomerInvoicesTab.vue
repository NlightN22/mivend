<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvPagination, useIsMobileViewport, useLatestRequest } from '@mivend/ui-kit';
import InvoicesTable from '../invoices/InvoicesTable.vue';
import CustomerInvoicesDataTable from './CustomerInvoicesDataTable.vue';
import { useAuthStore } from '../../stores/auth';
import {
    fetchInvoicesPage,
    fetchInvoiceViewCounts,
    DEFAULT_INVOICE_FILTERS,
    type InvoiceListItem,
    type InvoiceViewCounts,
} from '../../api/invoices';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerOrdersTab.vue. Desktop uses CustomerInvoicesDataTable (built on
// @mivend/ui-kit's MvAdvancedDataTable, the manager portal's standard desktop table); mobile keeps
// the existing InvoicesTable (MvTable-based) — same isMobile split CustomerOrdersTab.vue uses.
const props = defineProps<{ counterpartyId: string }>();

const isMobile = useIsMobileViewport(800);
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
const VIEWS: { key: ViewKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'issued', label: 'Issued' },
    { key: 'paid', label: 'Paid' },
    { key: 'cancelled', label: 'Cancelled' },
];
const viewCounts = ref<InvoiceViewCounts>({ all: 0, pending: 0, issued: 0, paid: 0, cancelled: 0 });

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
watch([page, statusFilter, searchFilter, pageSize], () => void load());

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
    <div v-if="isMobile" class="customer-invoices__views">
        <button
            v-for="view in VIEWS"
            :key="view.key"
            type="button"
            class="customer-invoices__view-chip"
            :class="{ 'customer-invoices__view-chip--active': activeView === view.key }"
            @click="activeView = view.key"
        >
            {{ view.label }} {{ viewCounts[view.key] }}
        </button>
    </div>

    <template v-if="isMobile">
        <!-- Same top+bottom MvPagination pattern as CustomerOrdersTab.vue/OrdersPage.vue. -->
        <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />

        <InvoicesTable
            :invoices="invoices"
            :counterparty-names="new Map()"
            compact
            :page-size="pageSize"
            :loading="loading"
        />
        <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
    </template>
    <CustomerInvoicesDataTable
        v-else
        :invoices="invoices"
        :loading="loading"
        :total-items="totalItems"
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
            <button
                v-for="view in VIEWS"
                :key="view.key"
                type="button"
                class="customer-invoices__view-chip"
                :class="{ 'customer-invoices__view-chip--active': activeView === view.key }"
                @click="activeView = view.key"
            >
                {{ view.label }} {{ viewCounts[view.key] }}
            </button>
        </template>
    </CustomerInvoicesDataTable>
</template>

<style scoped>
.customer-invoices__views {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
}

.customer-invoices__view-chip {
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    color: var(--el-text-color-secondary, #6b7280);
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
}

.customer-invoices__view-chip:hover {
    border-color: var(--el-text-color-secondary, #9ca3af);
}

.customer-invoices__view-chip--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    border-color: #bcebdd;
    color: var(--el-color-primary-dark-2, #008a70);
}
</style>
