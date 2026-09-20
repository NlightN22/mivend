<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvButton,
    MvStatusBadge,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { PendingErpUserRow } from '../../api/users';

// Settings > Users > Pending (issue #119 Phase 2) — ERP candidates with no manager-portal
// account yet. Server-side paginated (manager-table-standard skill). No status filter/column: the
// whole dataset is "Pending" by definition (see access-control.plugin.ts's PendingErpUser
// entity), so a status filter would have exactly one value.
const props = defineProps<{
    users: PendingErpUserRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    creatingErpId: string | null;
    departmentName: (departmentId: string | null) => string;
}>();

const emit = defineEmits<{
    'update:search': [search: string];
    'update:page': [page: number];
    'update:page-size': [size: number];
    create: [erpId: string];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'fullName',
        header: 'Name',
        width: 200,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Name contains…' },
        mobile: { primary: true },
    },
    { field: 'email', header: 'Email', width: 220, filterConfig: { type: 'none' } },
    { field: 'department', header: 'Department', width: 160, filterConfig: { type: 'none' } },
    { field: 'status', header: 'Status', width: 110, filterConfig: { type: 'none' }, mobile: { badge: true } },
    { field: 'action', header: 'Action', width: 170, filterConfig: { type: 'none' } },
];

interface PendingFilterState {
    [key: string]: unknown;
    fullName: string;
}
const BLANK_FILTERS: PendingFilterState = { fullName: '' };

const { state: tableState } = useDataTableState<PendingFilterState>(
    'settings-pending-erp-users-datatable',
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { fullName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ['fullName'],
        externallyOwned: { pageSize: true, filterKeys: ['fullName'] },
    },
);

watch(() => tableState.value.filters, f => emit('update:search', f.fullName), { deep: true });
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, fullName: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface Row {
    [key: string]: unknown;
    id: string;
    erpId: string;
    fullName: string;
    email: string;
    department: string;
    status: string;
}
const rows = computed<Row[]>(() =>
    props.users.map(u => ({
        id: u.id,
        erpId: u.erpId,
        fullName: u.fullName ?? u.email ?? u.erpId,
        email: u.email ?? '—',
        department: props.departmentName(u.departmentId),
        status: 'Pending',
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
        :search="{ filterKey: 'fullName', placeholder: 'Search pending users…' }"
        empty-message="No pending users"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-status>
            <MvStatusBadge variant="warning">Pending</MvStatusBadge>
        </template>
        <template #cell-action="{ data }">
            <MvButton
                size="sm"
                :loading="creatingErpId === (data as Row).erpId"
                :disabled="creatingErpId !== null && creatingErpId !== (data as Row).erpId"
                @click="emit('create', (data as Row).erpId)"
            >
                Create administrator
            </MvButton>
        </template>
    </MvAdvancedDataTable>
</template>
