<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { UnsortedAdministratorRow } from '../../api/visibilityGrants';

const { t } = useI18n();

// Server-side paginated: live administrators with no branch whose roles do not see everything.
const props = defineProps<{
    items: UnsortedAdministratorRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    administratorId: string;
}>();
const emit = defineEmits<{
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'emailAddress',
        header: t('settingsAccess.unsorted.columns.email'),
        width: 240,
        required: true,
        // The backend lists in id order; there is no server-side search for this list.
        filterConfig: { type: 'none' },
        mobile: { primary: true },
    },
    {
        field: 'name',
        header: t('settingsAccess.unsorted.columns.name'),
        width: 200,
        filterConfig: { type: 'none' },
    },
    {
        field: 'departmentId',
        header: t('settingsAccess.unsorted.columns.department'),
        width: 200,
        filterConfig: { type: 'none' },
    },
    {
        field: 'roles',
        header: t('settingsAccess.unsorted.columns.roles'),
        width: 200,
        filterConfig: { type: 'none' },
    },
]);

const { state: tableState } = useDataTableState<{ [key: string]: unknown }>(
    `unsorted-administrators-datatable:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: {},
        pageSize: props.pageSize,
    },
    { columns: ALL_COLUMNS.value, allowedFilterKeys: [], externallyOwned: { pageSize: true } },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

const rows = computed(() =>
    props.items.map(a => ({
        ...a,
        name: `${a.firstName} ${a.lastName}`.trim(),
        roles: a.roleCodes.join(', '),
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
        :default-filters="{}"
        :empty-message="t('settingsAccess.unsorted.emptyAdministrators')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    />
</template>
