<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvAdvancedDataTable,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import type { OrganizationRequisites } from '../../api/organizations';

// See manager-table-standard skill for the checklist this follows. `legalName` is the
// identifying/required column (a human types the legal entity's name, not its ERP guid), backed
// by a real toolbar search + funnel filter. `organizationRequisites` takes no args (a bounded
// reference list of the business's own legal entities, exempt from server pagination per the
// backend-plugin-rules skill's Pagination section, same exemption class as
// WarehouseCurationTable.vue) so the search/filter here is client-side, matching only
// `legalName`. `erpId` is a read-only 1C reference value with no operational reason to filter by
// it, so it stays `filterConfig: { type: 'none' }` like WarehouseCurationTable.vue's own `erpId`
// column. This is a v1 read-only list (issue #88): no create/edit/delete action.
const props = defineProps<{
    organizations: OrganizationRequisites[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'legalName',
        header: 'Organization',
        width: 260,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Legal name contains…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'Created', width: 140, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'erpId', header: 'ERP id', width: 220, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'isActive', header: 'Status', width: 120, filterConfig: { type: 'none' }, mobile: { badge: true } },
    {
        field: 'hasCompleteRequisites',
        header: 'Requisites',
        width: 140,
        filterConfig: { type: 'none' },
    },
];

interface OrganizationFilterState {
    [key: string]: unknown;
    legalName: string;
}
const BLANK_FILTERS: OrganizationFilterState = { legalName: '' };

const { state: tableState } = useDataTableState<OrganizationFilterState>(
    `organizations-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { legalName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // `legalName` (search) and `pageSize` are OrganizationsPage's own concern — it owns the
        // filtering/slicing — so always seed from its current prop values, never stale
        // localStorage (same reasoning as WarehouseCurationTable.vue).
        externallyOwned: { pageSize: true, filterKeys: ['legalName'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { search: f.legalName }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, legalName: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface OrganizationRow {
    [key: string]: unknown;
    id: string;
    legalName: string;
    createdAt: string;
    erpId: string;
    isActive: boolean;
    isActiveVariant: StatusBadgeVariant;
    hasCompleteRequisites: boolean;
    hasCompleteRequisitesVariant: StatusBadgeVariant;
}
const rows = computed<OrganizationRow[]>(() =>
    props.organizations.map(o => ({
        id: o.id,
        legalName: o.legalName,
        createdAt: o.createdAt,
        erpId: o.erpId,
        isActive: o.isActive,
        isActiveVariant: o.isActive ? 'success' : 'neutral',
        hasCompleteRequisites: o.hasCompleteRequisites,
        hasCompleteRequisitesVariant: o.hasCompleteRequisites ? 'success' : 'warning',
    })),
);

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
}
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
        :search="{ filterKey: 'legalName', placeholder: 'Search organizations…' }"
        empty-message="No organizations match your search"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #cell-createdAt="{ data }">
            {{ formatDate((data as OrganizationRow).createdAt) }}
        </template>
        <template #cell-isActive="{ data }">
            <MvStatusBadge :variant="(data as OrganizationRow).isActiveVariant">
                {{ (data as OrganizationRow).isActive ? 'Active' : 'Inactive' }}
            </MvStatusBadge>
        </template>
        <template #cell-hasCompleteRequisites="{ data }">
            <MvStatusBadge :variant="(data as OrganizationRow).hasCompleteRequisitesVariant">
                {{ (data as OrganizationRow).hasCompleteRequisites ? 'Complete' : 'Incomplete' }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
