<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import type { OrganizationRequisites } from '../../api/organizations';

// Bounded reference list, so the search over `legalName` is client-side; read-only, no row actions.
const { t } = useI18n();
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

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'legalName',
        header: t('settingsAccess.organizations.columns.organization'),
        width: 260,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.organizations.filters.name') },
        mobile: { primary: true },
    },
    {
        field: 'createdAt',
        header: t('settingsAccess.organizations.columns.created'),
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'erpId',
        header: t('settingsAccess.organizations.columns.erpId'),
        width: 220,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'isActive',
        header: t('settingsAccess.organizations.columns.status'),
        width: 120,
        filterConfig: { type: 'none' },
        mobile: { badge: true },
    },
    {
        field: 'hasCompleteRequisites',
        header: t('settingsAccess.organizations.columns.requisites'),
        width: 140,
        filterConfig: { type: 'none' },
    },
]);

interface OrganizationFilterState {
    [key: string]: unknown;
    legalName: string;
}
const BLANK_FILTERS: OrganizationFilterState = { legalName: '' };

const { state: tableState } = useDataTableState<OrganizationFilterState>(
    `organizations-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { legalName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ALL_COLUMNS.value
            .filter(c => c.filterConfig.type !== 'none')
            .map(c => c.field),
        // The page owns the filtering and slicing, so seed from its props, never stale localStorage.
        externallyOwned: { pageSize: true, filterKeys: ['legalName'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { search: f.legalName }),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

watch(
    () => props.searchFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, legalName: v };
    },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

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
        :search="{ filterKey: 'legalName', placeholder: t('settingsAccess.organizations.search') }"
        :empty-message="t('settingsAccess.organizations.empty')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #cell-createdAt="{ data }">
            {{ formatDate((data as OrganizationRow).createdAt) }}
        </template>
        <template #cell-isActive="{ data }">
            <MvStatusBadge :variant="(data as OrganizationRow).isActiveVariant">
                {{
                    (data as OrganizationRow).isActive
                        ? t('settingsAccess.organizations.active')
                        : t('settingsAccess.organizations.inactive')
                }}
            </MvStatusBadge>
        </template>
        <template #cell-hasCompleteRequisites="{ data }">
            <MvStatusBadge :variant="(data as OrganizationRow).hasCompleteRequisitesVariant">
                {{
                    (data as OrganizationRow).hasCompleteRequisites
                        ? t('settingsAccess.organizations.complete')
                        : t('settingsAccess.organizations.incomplete')
                }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
