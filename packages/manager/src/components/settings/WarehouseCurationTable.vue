<script setup lang="ts">
import { computed, watch } from 'vue';
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

// See manager-table-standard skill for the checklist this follows. `name` is the identifying/
// required column (a warehouse's own human-readable name is what someone types first — the ERP
// id is a secondary reference value, not what a person searches by), backed by a real toolbar
// search + funnel filter. The search is client-side (see BranchSettingsPage.vue's own doc
// comment on why this table is exempt from server pagination) and, to preserve the previous
// behavior, matches against `name` OR `erpId` — still a "real filter", just not a server one.
// `erpId`/`erpIsActive` are 1C's own suggested values, shown read-only next to the
// human-curated `assignedBranch`/`includedInBranchAtp` columns — neither is filterable, since
// there's no operational reason to filter by them and the backend `warehouses` query has no
// filter args at all. No `createdAt` column: `warehouses` doesn't expose it (a static ERP
// reference list, not an activity feed — not worth a schema change for this migration).
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

const branchOptions = computed<SelectOption[]>(() =>
    props.branches.map(b => ({ value: b.id, label: b.name })),
);

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'name',
        header: 'Warehouse',
        width: 220,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Name or ERP id contains…' },
        mobile: { primary: true },
    },
    { field: 'erpId', header: 'ERP id', width: 140, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    {
        field: 'erpIsActive',
        header: '1C isActive',
        width: 130,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    { field: 'assignedBranchId', header: 'Assigned branch', width: 220, filterConfig: { type: 'none' } },
    { field: 'includedInBranchAtp', header: 'Included in branch ATP', width: 190, filterConfig: { type: 'none' } },
];

interface WarehouseFilterState {
    [key: string]: unknown;
    name: string;
}
const BLANK_FILTERS: WarehouseFilterState = { name: '' };

const { state: tableState } = useDataTableState<WarehouseFilterState>(
    `warehouse-curation-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { name: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // `name` (search) and `pageSize` are BranchSettingsPage's own concern — it owns the
        // filtering/slicing — so always seed from its current prop values, never stale
        // localStorage (same reasoning as CustomerInvoicesDataTable.vue).
        externallyOwned: { pageSize: true, filterKeys: ['name'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { search: f.name }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, name: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface WarehouseRow {
    [key: string]: unknown;
    id: string;
    name: string;
    erpId: string;
    erpIsActive: boolean;
    erpIsActiveVariant: StatusBadgeVariant;
    assignedBranchId: string;
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
        :search="{ filterKey: 'name', placeholder: 'Search warehouses…' }"
        empty-message="No warehouses match your search"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #cell-erpIsActive="{ data }">
            <MvStatusBadge :variant="(data as WarehouseRow).erpIsActiveVariant">
                {{ (data as WarehouseRow).erpIsActive ? 'Active' : 'Inactive' }}
            </MvStatusBadge>
        </template>
        <template #cell-assignedBranchId="{ data }">
            <MvSelect
                :model-value="(data as WarehouseRow).assignedBranchId"
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
                            branchId: (data as WarehouseRow).assignedBranchId,
                            includedInBranchAtp: value,
                        })
                "
            />
        </template>
    </MvAdvancedDataTable>
</template>
