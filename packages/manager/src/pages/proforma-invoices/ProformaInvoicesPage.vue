<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPanel, MvPagination, MvWarningBanner } from '@mivend/ui-kit';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchCounterpartyNames } from '../../api/customers';
import {
    DEFAULT_PROFORMA_INVOICE_FILTERS,
    fetchProformaInvoicesPage,
    type ProformaInvoiceFilters,
    type ProformaInvoiceListItem,
} from '../../api/proforma-invoices';
import ProformaInvoicesFilterBar from '../../components/proforma-invoices/ProformaInvoicesFilterBar.vue';
import ProformaInvoicesTable from '../../components/proforma-invoices/ProformaInvoicesTable.vue';

const filters = reactive<ProformaInvoiceFilters>({ ...DEFAULT_PROFORMA_INVOICE_FILTERS });
const page = ref(1);
const pageSize = 10;

const proformaInvoices = ref<ProformaInvoiceListItem[]>([]);
const totalItems = ref(0);
const counterpartyNames = ref<Map<string, string>>(new Map());
const loading = ref(true);

// Manager portal rule (see the manager-portal-rules skill): every filtered/sorted/paginated view must be a shareable
// URL — including counterpartyId (see api/proforma-invoices.ts's ProformaInvoiceFilters shape).
const { fromQuery, toQuery } = useUrlSyncedState(DEFAULT_PROFORMA_INVOICE_FILTERS);
fromQuery(filters, page);

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchProformaInvoicesPage(filters, page.value, pageSize);
        proformaInvoices.value = result.items;
        totalItems.value = result.totalItems;
        counterpartyNames.value = await fetchCounterpartyNames(
            result.items.map(i => i.counterpartyId),
        );
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_PROFORMA_INVOICE_FILTERS);
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
    <div class="proforma-invoices-page">
        <div class="proforma-invoices-page__header">
            <div class="proforma-invoices-page__breadcrumb">Workspace / Proforma invoices</div>
            <h1 class="proforma-invoices-page__title">Proforma invoices</h1>
            <p class="proforma-invoices-page__subtitle">
                {{ totalItems }} proforma invoices across your accessible scope.
            </p>
        </div>

        <MvWarningBanner
            v-if="filters.counterpartyId"
            action-text="Show all customers"
            @action="clearCounterpartyFilter"
        >
            Filtered to one customer ({{
                counterpartyNames.get(filters.counterpartyId) ?? filters.counterpartyId
            }}).
        </MvWarningBanner>

        <MvPanel title="Proforma invoices list">
            <ProformaInvoicesFilterBar
                :filters="filters"
                @update:filters="Object.assign(filters, $event)"
                @reset="resetFilters"
            />
            <MvPagination
                :page="page"
                :page-size="pageSize"
                :total="totalItems"
                @update:page="page = $event"
            />
            <ProformaInvoicesTable
                :proformaInvoices="proformaInvoices"
                :counterparty-names="counterpartyNames"
                :page-size="pageSize"
                :loading="loading"
            />
            <MvPagination
                :page="page"
                :page-size="pageSize"
                :total="totalItems"
                @update:page="page = $event"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.proforma-invoices-page__header {
    margin-bottom: 18px;
}

.proforma-invoices-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.proforma-invoices-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.proforma-invoices-page__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
