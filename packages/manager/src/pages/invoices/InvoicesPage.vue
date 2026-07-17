<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPanel, MvPagination, MvWarningBanner } from '@mivend/ui-kit';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchCounterpartyNames } from '../../api/customers';
import {
    DEFAULT_INVOICE_FILTERS,
    fetchInvoicesPage,
    type InvoiceFilters,
    type InvoiceListItem,
} from '../../api/invoices';
import InvoicesFilterBar from '../../components/invoices/InvoicesFilterBar.vue';
import InvoicesTable from '../../components/invoices/InvoicesTable.vue';

const filters = reactive<InvoiceFilters>({ ...DEFAULT_INVOICE_FILTERS });
const page = ref(1);
const pageSize = 10;

const invoices = ref<InvoiceListItem[]>([]);
const totalItems = ref(0);
const counterpartyNames = ref<Map<string, string>>(new Map());
const loading = ref(true);

// Manager portal rule (AGENTS.md): every filtered/sorted/paginated view must be a shareable
// URL — including counterpartyId, which arrives here from CustomerInvoicesTab's "View all"
// link (see api/invoices.ts's InvoiceFilters shape).
const { fromQuery, toQuery } = useUrlSyncedState(DEFAULT_INVOICE_FILTERS);
fromQuery(filters, page);

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchInvoicesPage(filters, page.value, pageSize);
        invoices.value = result.items;
        totalItems.value = result.totalItems;
        counterpartyNames.value = await fetchCounterpartyNames(
            result.items.map(i => i.counterpartyId),
        );
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_INVOICE_FILTERS);
    page.value = 1;
}

function clearCounterpartyFilter(): void {
    filters.counterpartyId = '';
    page.value = 1;
}

watch(page, () => {
    load();
    toQuery(filters, page);
});
watch(filters, () => {
    page.value = 1;
    load();
    toQuery(filters, page);
});

onMounted(load);
</script>

<template>
    <div class="invoices-page">
        <div class="invoices-page__header">
            <div class="invoices-page__breadcrumb">Workspace / Invoices</div>
            <h1 class="invoices-page__title">Invoices</h1>
            <p class="invoices-page__subtitle">{{ totalItems }} invoices across your accessible scope.</p>
        </div>

        <MvWarningBanner
            v-if="filters.counterpartyId"
            action-text="Show all customers"
            @action="clearCounterpartyFilter"
        >
            Filtered to one customer ({{ counterpartyNames.get(filters.counterpartyId) ?? filters.counterpartyId }}).
        </MvWarningBanner>

        <MvPanel title="Invoices list">
            <InvoicesFilterBar :filters="filters" @update:filters="Object.assign(filters, $event)" @reset="resetFilters" />
            <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
            <p v-if="loading" class="invoices-page__loading">Loading…</p>
            <InvoicesTable v-else :invoices="invoices" :counterparty-names="counterpartyNames" :page-size="pageSize" />
            <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
        </MvPanel>
    </div>
</template>

<style scoped>
.invoices-page__header {
    margin-bottom: 18px;
}

.invoices-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.invoices-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.invoices-page__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.invoices-page__loading {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
