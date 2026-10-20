<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    MvAdvancedDataTable,
    MvSelect,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { BranchOption } from '../../api/branchSettings';
import { isUnmappedWithPeople, type DepartmentTreeRow } from '../../utils/departmentTree';

// Bounded ERP department tree edited as a whole, so search is client-side (same exemption class as
// OrganizationsTable.vue). The tree order and indentation replace column sorting.
const props = defineProps<{
    rows: DepartmentTreeRow[];
    branches: BranchOption[];
    branchName: Map<string, string>;
    loading: boolean;
    savingId: string | null;
    onlyUnmapped: boolean;
    administratorId: string;
}>();
const emit = defineEmits<{ assign: [departmentErpId: string, branchId: string] }>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'name',
        header: 'Department',
        width: 320,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Department name contains…' },
        mobile: { primary: true },
    },
    { field: 'ownBranchId', header: 'Branch', width: 220, filterConfig: { type: 'none' } },
    { field: 'effective', header: 'Effective branch', width: 240, filterConfig: { type: 'none' } },
    { field: 'userCount', header: 'Users', width: 90, filterConfig: { type: 'none' } },
    {
        field: 'counterpartyCount',
        header: 'Counterparties',
        width: 140,
        filterConfig: { type: 'none' },
    },
];

interface Filters {
    [key: string]: unknown;
    name: string;
}
const { state: tableState } = useDataTableState<Filters>(
    `department-branch-datatable:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { name: '' },
        pageSize: 500,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ['name'],
        externallyOwned: { pageSize: true },
    },
);

interface Row extends DepartmentTreeRow {
    [key: string]: unknown;
}
const page = ref(1);
const visibleRows = computed<Row[]>(() => {
    const term = String(tableState.value.filters.name ?? '')
        .trim()
        .toLowerCase();
    return props.rows
        .filter(r => !props.onlyUnmapped || isUnmappedWithPeople(r))
        .filter(r => !term || r.name.toLowerCase().includes(term))
        .map(r => ({ ...r }));
});
const options = computed(() => [
    { value: '', label: 'Not set (inherit)' },
    ...props.branches.map(b => ({ value: b.id, label: b.name })),
]);
const inheritedFromName = (r: Row): string =>
    props.rows.find(x => x.departmentErpId === r.inheritedFromErpId)?.name ?? '';
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="visibleRows"
        :loading="loading"
        :total-items="visibleRows.length"
        :page="page"
        data-key="departmentErpId"
        :row-height-px="57"
        :header-height-px="65"
        :default-filters="{ name: '' }"
        :search="{ filterKey: 'name', placeholder: 'Search departments…' }"
        empty-message="No departments match"
        @update:page="p => (page = p)"
        @reset-page="page = 1"
    >
        <template #cell-name="{ data }">
            <span :style="{ paddingLeft: `${(data as Row).depth * 18}px` }">
                {{ (data as Row).name }}
            </span>
        </template>
        <template #cell-ownBranchId="{ data }">
            <MvSelect
                :model-value="(data as Row).ownBranchId ?? ''"
                :options="options"
                :disabled="savingId === (data as Row).departmentErpId"
                @update:model-value="v => emit('assign', (data as Row).departmentErpId, v)"
            />
        </template>
        <template #cell-effective="{ data }">
            <MvStatusBadge
                v-if="(data as Row).effectiveBranchId"
                :variant="(data as Row).ownBranchId ? 'success' : 'info'"
            >
                {{ branchName.get((data as Row).effectiveBranchId as string) ?? 'Unknown branch' }}
            </MvStatusBadge>
            <MvStatusBadge v-else variant="warning">Unmapped</MvStatusBadge>
            <span v-if="(data as Row).inheritedFromErpId" class="department-branch__source">
                from {{ inheritedFromName(data as Row) }}
            </span>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.department-branch__source {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
