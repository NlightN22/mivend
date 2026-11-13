<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvButton,
    MvStatusBadge,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { PendingErpUserRow } from '../../api/users';

// ERP candidates with no manager-portal account yet; no status filter, the whole dataset is pending.
const { t } = useI18n();
const props = defineProps<{
    users: PendingErpUserRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    creatingErpId: string | null;
    departmentName: (departmentId: string | null) => string;
    positionOptions: { value: string; label: string }[];
}>();

const emit = defineEmits<{
    'update:search': [search: string];
    'update:position': [positionErpId: string];
    'update:page': [page: number];
    'update:page-size': [size: number];
    create: [erpId: string];
}>();

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'fullName',
        header: t('settingsAccess.users.columns.name'),
        width: 200,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.pending.filters.name') },
        mobile: { primary: true },
    },
    {
        field: 'email',
        header: t('settingsAccess.users.columns.email'),
        width: 220,
        filterConfig: { type: 'none' },
    },
    {
        field: 'department',
        header: t('settingsAccess.users.columns.department'),
        width: 160,
        filterConfig: { type: 'none' },
    },
    {
        field: 'position',
        header: t('settingsAccess.pending.columns.position'),
        width: 180,
        filterConfig: {
            type: 'select',
            placeholder: t('settingsAccess.pending.filters.allPositions'),
            options: [],
        },
    },
    {
        field: 'status',
        header: t('settingsAccess.users.columns.status'),
        width: 110,
        filterConfig: { type: 'none' },
        mobile: { badge: true },
    },
    {
        field: 'action',
        header: t('settingsAccess.pending.columns.action'),
        width: 170,
        filterConfig: { type: 'none' },
    },
]);

interface PendingFilterState {
    [key: string]: unknown;
    fullName: string;
    position: string;
}
const BLANK_FILTERS: PendingFilterState = { fullName: '', position: '' };

const columns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.value.map(col =>
        col.field === 'position'
            ? {
                  ...col,
                  filterConfig: {
                      type: 'select' as const,
                      placeholder: t('settingsAccess.pending.filters.allPositions'),
                      options: [
                          { value: '', label: t('settingsAccess.pending.filters.allPositions') },
                          ...props.positionOptions,
                      ],
                  },
              }
            : col,
    ),
);

const { state: tableState } = useDataTableState<PendingFilterState>(
    'settings-pending-erp-users-datatable',
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { fullName: props.searchFilter, position: '' },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ['fullName', 'position'],
        externallyOwned: { pageSize: true, filterKeys: ['fullName'] },
    },
);

watch(
    () => tableState.value.filters,
    f => {
        emit('update:search', f.fullName);
        emit('update:position', f.position ?? '');
    },
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => props.searchFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, fullName: v };
    },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

interface Row {
    [key: string]: unknown;
    id: string;
    erpId: string;
    fullName: string;
    email: string;
    department: string;
    position: string;
}
const rows = computed<Row[]>(() =>
    props.users.map(u => ({
        id: u.id,
        erpId: u.erpId,
        fullName: u.fullName ?? u.email ?? u.erpId,
        email: u.email ?? '—',
        department: props.departmentName(u.departmentId),
        position: u.position ?? '—',
    })),
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
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'fullName', placeholder: t('settingsAccess.pending.search') }"
        :empty-message="t('settingsAccess.pending.empty')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-status>
            <MvStatusBadge variant="warning">{{
                t('settingsAccess.pending.status')
            }}</MvStatusBadge>
        </template>
        <template #cell-action="{ data }">
            <MvButton
                size="sm"
                :loading="creatingErpId === (data as Row).erpId"
                :disabled="creatingErpId !== null && creatingErpId !== (data as Row).erpId"
                @click="emit('create', (data as Row).erpId)"
            >
                {{ t('settingsAccess.pending.create') }}
            </MvButton>
        </template>
    </MvAdvancedDataTable>
</template>
