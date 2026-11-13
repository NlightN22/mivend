<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvSelect,
    MvCheckbox,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type SelectOption,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import type { BranchOption, Warehouse } from '../../api/branchSettings';

// The client-side search matches `name` or `erpId`; the ERP columns are read-only reference values.
const { t } = useI18n();
const props = defineProps<{
    warehouses: Warehouse[];
    branches: BranchOption[];
    loading: boolean;
    savingWarehouseId: string | null;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    reassign: [payload: { warehouseId: string; branchId: string; includedInBranchAtp: boolean }];
    'update:filters': [filters: { search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

// The blank option keeps the native <select> from showing the first branch for an unassigned warehouse.
const branchOptions = computed<SelectOption[]>(() => [
    { value: '', label: t('settingsAccess.warehouses.unassigned') },
    ...props.branches.map(b => ({ value: b.id, label: b.name })),
]);

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'name',
        header: t('settingsAccess.warehouses.columns.warehouse'),
        width: 220,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.warehouses.filters.name') },
        mobile: { primary: true },
    },
    {
        field: 'erpId',
        header: t('settingsAccess.warehouses.columns.erpId'),
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'erpIsActive',
        header: t('settingsAccess.warehouses.columns.erpActive'),
        width: 130,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'assignedBranchId',
        header: t('settingsAccess.warehouses.columns.branch'),
        width: 220,
        filterConfig: { type: 'none' },
    },
    {
        field: 'includedInBranchAtp',
        header: t('settingsAccess.warehouses.columns.atp'),
        width: 190,
        filterConfig: { type: 'none' },
    },
]);

interface WarehouseFilterState {
    [key: string]: unknown;
    name: string;
}
const BLANK_FILTERS: WarehouseFilterState = { name: '' };

const { state: tableState } = useDataTableState<WarehouseFilterState>(
    `warehouse-curation-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { name: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ALL_COLUMNS.value
            .filter(c => c.filterConfig.type !== 'none')
            .map(c => c.field),
        // The page owns the filtering and slicing, so seed from its props, never stale localStorage.
        externallyOwned: { pageSize: true, filterKeys: ['name'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { search: f.name }),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

watch(
    () => props.searchFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, name: v };
    },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

interface WarehouseRow {
    [key: string]: unknown;
    id: string;
    name: string;
    erpId: string;
    erpIsActive: boolean;
    erpIsActiveVariant: StatusBadgeVariant;
    assignedBranchId: string | null;
    includedInBranchAtp: boolean;
}
const rows = computed<WarehouseRow[]>(() =>
    props.warehouses.map(w => ({
        id: w.id,
        name: w.name,
        erpId: w.erpId,
        erpIsActive: w.isActive,
        erpIsActiveVariant: w.isActive ? 'success' : 'neutral',
        assignedBranchId: w.branchId,
        includedInBranchAtp: w.includedInBranchAtp,
    })),
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
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'name', placeholder: t('settingsAccess.warehouses.search') }"
        :empty-message="t('settingsAccess.warehouses.empty')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #cell-erpIsActive="{ data }">
            <MvStatusBadge :variant="(data as WarehouseRow).erpIsActiveVariant">
                {{
                    (data as WarehouseRow).erpIsActive
                        ? t('settingsAccess.warehouses.active')
                        : t('settingsAccess.warehouses.inactive')
                }}
            </MvStatusBadge>
        </template>
        <template #cell-assignedBranchId="{ data }">
            <MvSelect
                :model-value="(data as WarehouseRow).assignedBranchId ?? ''"
                :options="branchOptions"
                :disabled="savingWarehouseId === (data as WarehouseRow).id"
                @update:model-value="
                    (value: string) =>
                        emit('reassign', {
                            warehouseId: (data as WarehouseRow).id,
                            branchId: value,
                            includedInBranchAtp: (data as WarehouseRow).includedInBranchAtp,
                        })
                "
            />
        </template>
        <template #cell-includedInBranchAtp="{ data }">
            <MvCheckbox
                :model-value="(data as WarehouseRow).includedInBranchAtp"
                :disabled="savingWarehouseId === (data as WarehouseRow).id"
                @update:model-value="
                    (value: boolean) =>
                        emit('reassign', {
                            warehouseId: (data as WarehouseRow).id,
                            branchId: (data as WarehouseRow).assignedBranchId ?? '',
                            includedInBranchAtp: value,
                        })
                "
            />
        </template>
    </MvAdvancedDataTable>
</template>
