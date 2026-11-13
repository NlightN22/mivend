<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { UnsortedCounterpartyRow } from '../../api/visibilityGrants';

const { t } = useI18n();

// Server-side paginated: counterparties with no resolved branch. shortName is the searched column.
const props = defineProps<{
    items: UnsortedCounterpartyRow[];
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

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'shortName',
        header: t('settingsAccess.unsorted.columns.counterparty'),
        width: 240,
        required: true,
        filterConfig: {
            type: 'text',
            placeholder: t('settingsAccess.unsorted.filters.counterparty'),
        },
        mobile: { primary: true },
    },
    {
        field: 'inn',
        header: t('settingsAccess.unsorted.columns.taxId'),
        width: 140,
        filterConfig: { type: 'none' },
    },
    {
        field: 'legalName',
        header: t('settingsAccess.unsorted.columns.legalName'),
        width: 260,
        filterConfig: { type: 'none' },
    },
    {
        field: 'departmentId',
        header: t('settingsAccess.unsorted.columns.department'),
        width: 200,
        filterConfig: { type: 'none' },
    },
    {
        field: 'assignedManagerId',
        header: t('settingsAccess.unsorted.columns.managerId'),
        width: 110,
        filterConfig: { type: 'none' },
    },
]);

interface Filters {
    [key: string]: unknown;
    shortName: string;
}
const { state: tableState } = useDataTableState<Filters>(
    `unsorted-counterparties-datatable:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { shortName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
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

const rows = computed(() => props.items.map(i => ({ ...i })));
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
        :search="{
            filterKey: 'shortName',
            placeholder: t('settingsAccess.unsorted.searchCounterparties'),
        }"
        :empty-message="t('settingsAccess.unsorted.emptyCounterparties')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    />
</template>
