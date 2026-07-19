<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { MvPagination } from '@mivend/ui-kit';
import InvoicesTable from '../invoices/InvoicesTable.vue';
import {
    fetchInvoicesPage,
    fetchInvoiceViewCounts,
    DEFAULT_INVOICE_FILTERS,
    type InvoiceListItem,
    type InvoiceViewCounts,
} from '../../api/invoices';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerOrdersTab.vue, rather than receiving a pre-loaded array from
// CustomerDetailPage.
const props = defineProps<{ counterpartyId: string }>();

const PAGE_SIZE = 20;
const page = ref(1);
const totalItems = ref(0);
const invoices = ref<InvoiceListItem[]>([]);
const loading = ref(true);

type ViewKey = 'all' | 'pending' | 'issued' | 'paid' | 'cancelled';
const activeView = ref<ViewKey>('all');
const VIEWS: { key: ViewKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'issued', label: 'Issued' },
    { key: 'paid', label: 'Paid' },
    { key: 'cancelled', label: 'Cancelled' },
];
const viewCounts = ref<InvoiceViewCounts>({ all: 0, pending: 0, issued: 0, paid: 0, cancelled: 0 });

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchInvoicesPage(
            {
                ...DEFAULT_INVOICE_FILTERS,
                status: activeView.value === 'all' ? '' : activeView.value,
                counterpartyId: props.counterpartyId,
            },
            page.value,
            PAGE_SIZE,
        );
        invoices.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchInvoiceViewCounts(props.counterpartyId);
}

watch(activeView, () => {
    page.value = 1;
});
watch([page, activeView], () => void load());

onMounted(() => {
    void load();
    void loadCounts();
});
</script>

<template>
    <div class="customer-invoices__views">
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

    <!-- Same top+bottom MvPagination pattern as CustomerOrdersTab.vue/OrdersPage.vue. -->
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />

    <InvoicesTable
        :invoices="invoices"
        :counterparty-names="new Map()"
        compact
        :page-size="PAGE_SIZE"
        :loading="loading"
    />
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
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
