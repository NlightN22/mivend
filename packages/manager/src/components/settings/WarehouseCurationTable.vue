<script setup lang="ts">
import { computed, h } from 'vue';
import type { Column } from 'element-plus';
import { MvTable, MvSelect, MvCheckbox, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow, SelectOption } from '@mivend/ui-kit';
import type { BranchOption, Warehouse } from '../../api/branchSettings';

const props = defineProps<{
    warehouses: Warehouse[];
    branches: BranchOption[];
    loading: boolean;
    savingWarehouseId: string | null;
}>();

const emit = defineEmits<{
    reassign: [payload: { warehouseId: string; branchId: string; includedInBranchAtp: boolean }];
}>();

const branchOptions = computed<SelectOption[]>(() =>
    props.branches.map(b => ({ value: b.id, label: b.name })),
);

function branchName(branchId: string): string {
    return props.branches.find(b => b.id === branchId)?.name ?? branchId;
}

// erpBranchName/isActive are 1C's own suggested values (see Warehouse entity doc comment) —
// shown read-only as reference next to the human-curated branchId/includedInBranchAtp columns,
// never editable here.
const columns = computed<Column<TableRow>[]>(() => [
    { key: 'name', title: 'Warehouse', dataKey: 'name', width: 220 },
    { key: 'erpId', title: 'ERP id', dataKey: 'erpId', width: 140 },
    {
        key: 'erpIsActive',
        title: '1C isActive',
        dataKey: 'erpIsActive',
        width: 120,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            const isActive = row.erpIsActive as boolean;
            return h(MvStatusBadge, { variant: isActive ? 'success' : 'neutral' }, () =>
                isActive ? 'Active' : 'Inactive',
            );
        },
    },
    {
        key: 'assignedBranch',
        title: 'Assigned branch',
        dataKey: 'assignedBranch',
        width: 220,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            const warehouseId = row._warehouseId as string;
            const branchId = row._branchId as string;
            const includedInBranchAtp = row._includedInBranchAtp as boolean;
            return h(MvSelect, {
                modelValue: branchId,
                options: branchOptions.value,
                disabled: props.savingWarehouseId === warehouseId,
                'onUpdate:modelValue': (value: string) =>
                    emit('reassign', { warehouseId, branchId: value, includedInBranchAtp }),
            });
        },
    },
    {
        key: 'includedInBranchAtp',
        title: 'Included in branch ATP',
        dataKey: 'includedInBranchAtp',
        width: 180,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            const warehouseId = row._warehouseId as string;
            const branchId = row._branchId as string;
            const includedInBranchAtp = row._includedInBranchAtp as boolean;
            return h(MvCheckbox, {
                modelValue: includedInBranchAtp,
                disabled: props.savingWarehouseId === warehouseId,
                'onUpdate:modelValue': (value: boolean) =>
                    emit('reassign', { warehouseId, branchId, includedInBranchAtp: value }),
            });
        },
    },
]);

const rows = computed<TableRow[]>(() =>
    props.warehouses.map(w => ({
        name: w.name,
        erpId: w.erpId,
        erpIsActive: w.isActive,
        assignedBranch: branchName(w.branchId),
        includedInBranchAtp: w.includedInBranchAtp,
        _warehouseId: w.id,
        _branchId: w.branchId,
        _includedInBranchAtp: w.includedInBranchAtp,
    })),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :height="Math.max(rows.length, 1) * 60 + 40"
        :row-height="60"
        empty-text="No warehouses match your search"
    />
</template>
