<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    useDataTableState,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import type { ManagerOption } from '../../api/orders';
import {
    restoreApprovalsFilters,
    type ApprovalsListFilters,
    type ApprovalsSort,
} from '../../api/approvals-list';
import { APPROVALS_URL_DEFAULTS } from '../../composables/approvalsListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { ALL_COLUMNS, DEFAULT_HIDDEN_COLUMNS } from './approvalsColumns';
import type { ApprovalListRow } from './approvalsListRows';
import {
    BLANK_TABLE_FILTERS,
    sortFromState,
    sortToState,
    type ApprovalsTableFilters,
} from './approvalsTableState';

const { t } = useI18n();

const props = defineProps<{
    rows: ApprovalListRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: ApprovalsListFilters;
    sort: ApprovalsSort;
    managers: ManagerOption[];
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: ApprovalsListFilters];
    'update:sort': [sort: ApprovalsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.map(col =>
        col.field === 'requestedBy'
            ? { ...col, filterOptions: props.managers.map(m => ({ value: m.id, label: m.name })) }
            : col,
    ),
);

const { state: tableState } = useDataTableState<ApprovalsTableFilters>(
    `approvals-list-v1:${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
        sort: sortToState(props.sort, ALL_COLUMNS),
        filters: { id: props.filters.search },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: [],
        externallyOwned: { pageSize: true, filterKeys: Object.keys(BLANK_TABLE_FILTERS) },
    },
);
tableState.value.sort = sortToState(props.sort, ALL_COLUMNS);

watch(
    () => tableState.value.filters.id,
    search => {
        if (search !== props.filters.search) emit('update:filters', { ...props.filters, search });
    },
);
watch(
    () => tableState.value.sort,
    s => emit('update:sort', sortFromState(s, ALL_COLUMNS)),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => props.pageSize,
    size => {
        tableState.value.pageSize = size;
    },
);
watch(
    () => props.filters.search,
    search => {
        if (search !== tableState.value.filters.id) tableState.value.filters.id = search;
    },
);

const openedWithLink = Object.keys(APPROVALS_URL_DEFAULTS).some(k => k in useRoute().query);

function captureView(): TableViewState {
    return {
        filters: {
            search: props.filters.search,
            view: props.filters.view,
            conditions: props.filters.conditions,
        },
        sort: { ...props.sort },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}

function applyView(state: TableViewState): void {
    const fields = ALL_COLUMNS.map(c => c.field);
    const order = state.columnOrder.filter(f => fields.includes(f));
    tableState.value.columnOrder = [...order, ...fields.filter(f => !order.includes(f))];
    tableState.value.hiddenColumns = state.hiddenColumns.filter(
        f => fields.includes(f) && !ALL_COLUMNS.find(c => c.field === f)?.required,
    );
    const sort = sortToState(
        { field: state.sort.field as ApprovalsSort['field'], dir: state.sort.dir },
        ALL_COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, ALL_COLUMNS));
    emit('update:filters', restoreApprovalsFilters(state.filters));
}

const router = useRouter();
function onRowClick(event: AdvancedDataTableRowClickPayload<ApprovalListRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const href = router.resolve(`/approvals/${event.row.id}`).href;
    const mouse = event.originalEvent as MouseEvent;
    if (mouse.ctrlKey || mouse.metaKey) window.open(href, '_blank', 'noopener');
    else void router.push(href);
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="resolvedColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="61"
        :header-height-px="65"
        :search="{ filterKey: 'id', placeholder: t('approvals.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="BLANK_TABLE_FILTERS"
        :empty-message="t('approvals.list.empty')"
        @update:conditions="emit('update:filters', { ...filters, conditions: $event })"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('approvals.list.loadFailedTitle')"
                :message="t('approvals.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('approvals.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="approvals"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-id="{ data }">
            <RouterLink
                class="approvals-list-table__id"
                :to="`/approvals/${(data as ApprovalListRow).id}`"
                >{{ (data as ApprovalListRow).id }}</RouterLink
            >
        </template>
        <template #cell-subject="{ data }">
            <div class="approvals-list-table__wrap">{{ (data as ApprovalListRow).subject }}</div>
        </template>
        <template #cell-createdAt="{ data }">
            <MvDateTimeCell :value="(data as ApprovalListRow).createdAt" />
        </template>
        <template #cell-status="{ data }">
            <div class="approvals-list-table__badges">
                <MvStatusBadge :variant="(data as ApprovalListRow).statusVariant">{{
                    (data as ApprovalListRow).status
                }}</MvStatusBadge>
                <MvStatusBadge v-if="(data as ApprovalListRow).escalated" variant="warning">{{
                    t('approvals.header.escalated')
                }}</MvStatusBadge>
            </div>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped src="./ApprovalsListTable.css"></style>
