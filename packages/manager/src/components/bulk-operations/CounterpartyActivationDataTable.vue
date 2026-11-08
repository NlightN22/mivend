<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvFilterChips,
    MvSelect,
    MvStatusBadge,
    MvAdvancedDataTable,
    useDataTableState,
    type FilterChip,
} from '@mivend/ui-kit';
import { activationReadiness, type ActivationCandidate } from '../../api/counterpartyPortalAccess';
import type { ReadinessCounts } from '../../api/counterpartyActivationCounts';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';
import type { BranchOption } from '../../api/orders';
import { buildActivationColumns } from './activationColumns';
import {
    READINESS_BADGE_VARIANT,
    READINESS_LABEL,
    READINESS_VALUES,
    readinessText,
    type Readiness,
} from './activationReadiness';
import { mapSortToApi } from './counterpartySort';

export interface ActivationFilters {
    [key: string]: string;
    shortName: string;
    manager: string;
    branch: string;
    readiness: string;
}

// Rows of any readiness can be selected; the review step explains what will be skipped.
const props = defineProps<{
    items: ActivationCandidate[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: ActivationFilters;
    statusFilter: 'active' | 'inactive' | '';
    branchOptions: BranchOption[];
    readinessCounts: ReadinessCounts;
    selectedIds: Set<string>;
    managerName: (managerErpId: string | null) => string;
    branchName: (branchId: string | null) => string;
}>();

const emit = defineEmits<{
    'update:filters': [value: ActivationFilters];
    'update:status-filter': [value: 'active' | 'inactive' | ''];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'update:sort': [sort: CounterpartySortParameter];
    'update:selectedIds': [ids: Set<string>];
}>();

const columns = computed(() => buildActivationColumns(props.branchOptions));
const FILTER_KEYS = ['shortName', 'manager', 'branch', 'readiness'];
const BLANK_FILTERS: ActivationFilters = { shortName: '', manager: '', branch: '', readiness: '' };

const { state: tableState } = useDataTableState<ActivationFilters>(
    'bulk-operations-counterparty-activation-datatable',
    {
        columnOrder: columns.value.map(c => c.field),
        columnWidths: Object.fromEntries(columns.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [{ field: 'shortName', order: 1 }],
        filters: { ...props.filters },
        pageSize: props.pageSize,
    },
    {
        columns: columns.value,
        allowedFilterKeys: FILTER_KEYS,
        externallyOwned: { pageSize: true, filterKeys: FILTER_KEYS },
    },
);

function sameFilters(a: ActivationFilters, b: ActivationFilters): boolean {
    return FILTER_KEYS.every(k => a[k] === b[k]);
}

watch(
    () => tableState.value.filters,
    f => {
        if (!sameFilters(f, props.filters)) emit('update:filters', { ...f });
    },
    { deep: true },
);
watch(
    () => props.filters,
    f => {
        if (!sameFilters(f, tableState.value.filters)) tableState.value.filters = { ...f };
    },
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => tableState.value.sort,
    meta => emit('update:sort', mapSortToApi(meta, columns.value)),
    { deep: true },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

const STATUS_OPTIONS = [
    { value: '', label: 'Any status' },
    { value: 'active', label: 'Active (ERP)' },
    { value: 'inactive', label: 'Inactive (ERP)' },
];

const viewChips = computed<FilterChip[]>(() => [
    { key: '', label: `All (${props.readinessCounts.all})` },
    ...READINESS_VALUES.map(value => ({
        key: value,
        label: `${READINESS_LABEL[value]} (${props.readinessCounts[value]})`,
        variant: READINESS_BADGE_VARIANT[value],
    })),
]);

function selectReadiness(key: string): void {
    tableState.value.filters = { ...tableState.value.filters, readiness: key };
}

interface Row {
    [key: string]: unknown;
    id: string;
    shortName: string;
    inn: string;
    manager: string;
    branch: string;
    phone: string;
    officialEmail: string;
    readiness: Readiness;
    readinessText: string;
}

const rows = computed<Row[]>(() =>
    props.items.map(c => {
        const readiness = activationReadiness(c);
        return {
            id: c.id,
            shortName: c.shortName,
            inn: c.inn ?? '—',
            manager: props.managerName(c.managerErpId),
            branch: props.branchName(c.branchId),
            phone: c.phone ?? '—',
            officialEmail: c.officialEmail ?? '—',
            readiness,
            readinessText: readinessText(readiness, c),
        };
    }),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="52"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'shortName', placeholder: 'Search company name…' }"
        empty-message="No counterparties match these filters"
        selectable
        :selected-ids="selectedIds"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
        @update:selected-ids="emit('update:selectedIds', $event)"
    >
        <template #toolbar-start>
            <MvFilterChips
                :chips="viewChips"
                :active="tableState.filters.readiness"
                @select="selectReadiness"
            />
            <MvSelect
                :model-value="statusFilter"
                :options="STATUS_OPTIONS"
                @update:model-value="
                    emit('update:status-filter', $event as 'active' | 'inactive' | '')
                "
            />
        </template>

        <template #toolbar-end>
            <slot name="toolbar-end" />
        </template>

        <template #cell-readiness="{ data }">
            <MvStatusBadge :variant="READINESS_BADGE_VARIANT[(data as Row).readiness]">
                {{ (data as Row).readinessText }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
