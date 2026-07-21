<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvStatusBadge,
    MvDocumentTypeChip,
    MvAdvancedDataTable,
    MvDateTimeCell,
    useDataTableState,
    resolveDocumentTypeStyle,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    DOCUMENT_STATUS_OPTIONS,
    DOCUMENT_STATUS_BADGE_VARIANT,
    type CustomerDocument,
} from '../../api/customers';

// Fifth consumer of @mivend/ui-kit's MvAdvancedDataTable, same shape as
// CustomerDiscountsDataTable.vue — see manager-table-standard skill. `number` (Document #) is the
// identifying/required column, backed by a real toolbar search + funnel filter
// (DocumentListOptions.search, ILIKE against the document's own number — see
// DocumentsService.findVisible's doc comment). `type` is real ERP business data with no fixed
// value set (AGENTS.md "Business data must live in the database" — never a hardcoded dropdown),
// but its checklist filter is populated from real distinct values fetched from the backend
// (`typeOptions` prop, see CustomerDocumentsTab.vue's fetchDocumentTypes) — the exact same
// `type: 'status'` filterConfig/MvColumnFilterStatus widget the Status column below already
// uses, not a bespoke filter component, and colored via resolveDocumentTypeStyle — the same
// palette function MvDocumentTypeChip (the row cell) uses, so the checklist and the row can never
// show different colors for the same type. `status` is a real status filter backed by the
// document-generation pipeline's own fixed lifecycle. `issueDate` has no filter — the backend
// doesn't support filtering by it yet (a date-range filter would need backend support first, same
// as `amount`/`order` on CustomerInvoicesDataTable.vue).
const props = defineProps<{
    documents: CustomerDocument[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    typeOptions: string[];
    typeFilter: string[];
    statusFilter: string;
    searchFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { types: string[]; status: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Document #',
        width: 180,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Document number contains…' },
        mobile: { primary: true },
    },
    { field: 'issueDate', header: 'Issue date', width: 130, filterConfig: { type: 'none' } },
    {
        field: 'type',
        header: 'Type',
        width: 140,
        // options spliced in by resolvedColumns below, once typeOptions arrives from the backend.
        filterConfig: { type: 'status', multiple: true, placeholder: 'All types', options: [] },
    },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        filterConfig: {
            type: 'status',
            placeholder: 'All statuses',
            options: DOCUMENT_STATUS_OPTIONS.filter(o => o.value).map(o => ({
                value: o.value,
                label: o.label,
                variant: DOCUMENT_STATUS_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { badge: true },
    },
];

// Splices in the Type column's live options — see ALL_COLUMNS' doc comment on the 'type' entry —
// same shape as CustomerOrdersDataTable.vue's resolvedColumns (its 'placedBy' entry).
const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.map(col => {
        if (col.field === 'type' && col.filterConfig.type === 'status') {
            return {
                ...col,
                filterConfig: {
                    ...col.filterConfig,
                    options: props.typeOptions.map(t => ({
                        value: t,
                        label: t,
                        variant: resolveDocumentTypeStyle(t).variant,
                    })),
                },
            };
        }
        return col;
    }),
);

interface DocumentFilterState {
    [key: string]: unknown;
    type: string[];
    status: string;
    number: string;
}
const BLANK_FILTERS: DocumentFilterState = { type: [], status: '', number: '' };

const { state: tableState } = useDataTableState<DocumentFilterState>(
    `customer-documents-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { type: props.typeFilter, status: props.statusFilter, number: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // type/status/number(search)/pageSize are the tab's own concern (it owns the fetch) —
        // always seed from the tab's current prop values, never from stale localStorage.
        externallyOwned: { pageSize: true, filterKeys: ['type', 'status', 'number'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { types: f.type, status: f.status, search: f.number }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

watch(() => props.typeFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, type: v };
});
watch(() => props.statusFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, status: v };
});
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, number: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface DocumentRow {
    [key: string]: unknown;
    id: string;
    number: string;
    type: string;
    issueDate: string;
    status: string;
    statusVariant: StatusBadgeVariant;
}
const rows = computed<DocumentRow[]>(() =>
    props.documents.map(doc => ({
        id: doc.id,
        number: doc.number,
        type: doc.type,
        issueDate: doc.issueDate,
        status: DOCUMENT_STATUS_OPTIONS.find(o => o.value === doc.status)?.label ?? doc.status,
        statusVariant: DOCUMENT_STATUS_BADGE_VARIANT[doc.status] ?? 'neutral',
    })),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="resolvedColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'number', placeholder: 'Search documents…' }"
        empty-message="No documents for this customer"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #cell-issueDate="{ data }">
            <MvDateTimeCell :value="(data as DocumentRow).issueDate" />
        </template>
        <template #cell-type="{ data }">
            <MvDocumentTypeChip :type="(data as DocumentRow).type" />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as DocumentRow).statusVariant">{{ (data as DocumentRow).status }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
