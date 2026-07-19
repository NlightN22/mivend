<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvPagination, MvTableFilters, type TableFilterFieldDef } from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import {
    fetchDocumentsPageForCounterparty,
    DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
    DOCUMENT_STATUS_OPTIONS,
    type CustomerDocument,
    type CustomerDocumentFilters,
} from '../../api/customers';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerOrdersTab.vue, rather than receiving a pre-loaded array from
// CustomerDetailPage.
const props = defineProps<{ counterpartyId: string }>();

const PAGE_SIZE = 20;
const page = ref(1);
const totalItems = ref(0);
const documents = ref<CustomerDocument[]>([]);
const loading = ref(true);
const filters = reactive<CustomerDocumentFilters>({ ...DEFAULT_CUSTOMER_DOCUMENT_FILTERS });

// `type` is ERP/business-sourced (see api/customers.ts's doc comment on DOCUMENT_STATUS_OPTIONS)
// — free-text search, not a fixed dropdown. `status` is a genuinely fixed internal state.
const filterFields: TableFilterFieldDef[] = [
    { key: 'type', label: 'Type', type: 'search', placeholder: 'invoice, contract...' },
    { key: 'status', label: 'Status', type: 'select', options: [...DOCUMENT_STATUS_OPTIONS] },
];

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchDocumentsPageForCounterparty(props.counterpartyId, page.value, PAGE_SIZE, filters);
        documents.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_CUSTOMER_DOCUMENT_FILTERS);
    page.value = 1;
}

watch(filters, () => {
    page.value = 1;
});
watch([page, filters], () => void load());

onMounted(load);

function variant(status: string): StatusBadgeVariant {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'generating') return 'warning';
    return 'neutral';
}

// MvTable renders this same column config as mobile cards below its own breakpoint — no
// separate hand-written mobile column set needed (see MvTable.vue).
const columns: Column<TableRow>[] = [
    { key: 'number', title: 'Document #', dataKey: 'number', width: 180, mobile: { primary: true } },
    { key: 'type', title: 'Type', dataKey: 'type', width: 130 },
    { key: 'issueDate', title: 'Issue date', dataKey: 'issueDate', width: 130 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 140,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(MvStatusBadge, { variant: row.statusVariant as StatusBadgeVariant }, () => row.status as string);
        },
        mobile: { badge: true },
    },
];

const rows = computed<TableRow[]>(() =>
    documents.value.map(doc => ({
        number: doc.number,
        type: doc.type,
        issueDate: new Date(doc.issueDate).toLocaleDateString('en-US'),
        status: doc.status,
        statusVariant: variant(doc.status),
    })),
);
</script>

<template>
    <MvTableFilters :fields="filterFields" :model-value="filters" @update:model-value="Object.assign(filters, $event)" @reset="resetFilters" />

    <!-- Same top+bottom MvPagination pattern as CustomerOrdersTab.vue/OrdersPage.vue. -->
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />

    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, PAGE_SIZE) * 52 + 40"
        :loading="loading"
        empty-text="No documents for this customer"
    />
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
</template>
