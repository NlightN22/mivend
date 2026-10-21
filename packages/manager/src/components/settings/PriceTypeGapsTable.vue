<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import { PRICE_TYPE_GAP_REASONS, type PriceTypeGapRow } from '../../api/priceTypeGaps';

// Server-side paginated: counterparties whose price type cannot be resolved. shortName is the searched column.
const props = defineProps<{
    items: PriceTypeGapRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    administratorId: string;
}>();
const emit = defineEmits<{
    'update:search': [search: string];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'shortName',
        header: 'Counterparty',
        width: 240,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Name or tax id contains…' },
        mobile: { primary: true },
    },
    { field: 'inn', header: 'Tax id', width: 140, filterConfig: { type: 'none' } },
    { field: 'reasonLabel', header: 'Reason', width: 320, filterConfig: { type: 'none' } },
    {
        field: 'mainContractId',
        header: 'Main contract',
        width: 220,
        filterConfig: { type: 'none' },
    },
];

interface Filters {
    [key: string]: unknown;
    shortName: string;
}
const { state: tableState } = useDataTableState<Filters>(
    `price-type-gaps-datatable:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { shortName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ['shortName'],
        externallyOwned: { pageSize: true, filterKeys: ['shortName'] },
    },
);
watch(
    () => tableState.value.filters.shortName,
    v => emit('update:search', v),
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

const rows = computed(() =>
    props.items.map(i => ({ ...i, reasonLabel: PRICE_TYPE_GAP_REASONS[i.reason] ?? i.reason })),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="{ shortName: '' }"
        :search="{ filterKey: 'shortName', placeholder: 'Search counterparties…' }"
        empty-message="Every counterparty has a resolved price type"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    />
</template>
