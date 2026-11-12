<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    MvFilterChips,
    MvStatusBadge,
    formatDocumentNumber,
    useDataTableState,
    type AdvancedDataTableRowClickPayload,
    type FilterChip,
} from '@mivend/ui-kit';
import { BATCH_STATUS_VARIANT, batchStatusLabel, type BulkBatch } from '../../api/bulkOperations';
import {
    BLANK_HISTORY_FILTERS,
    HISTORY_VIEWS,
    type BulkHistoryFilters,
} from '../../api/bulkHistoryFilter';
import type { BulkHistoryState, HistorySort } from '../../composables/useBulkHistory';
import type { TableViewState } from '../../composables/tableViewState';
import { sortFromState, sortToState } from '../orders/ordersTableFilters';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildHistoryColumns } from './bulkHistoryColumns';

const props = defineProps<{ history: BulkHistoryState; administratorId: string }>();
const history = props.history;
const { t } = useI18n();

const columns = computed(() =>
    buildHistoryColumns(history.operations.value.map(o => ({ value: o.type, label: o.title }))),
);
const baseColumns = buildHistoryColumns([]);

const { state: tableState } = useDataTableState<{ [key: string]: unknown; number: string }>(
    `bulk-history:${props.administratorId}`,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: sortToState(history.sort.value as never, baseColumns),
        filters: { number: history.filters.value.search },
        pageSize: history.pageSize.value,
    },
    {
        columns: baseColumns,
        allowedFilterKeys: [],
        externallyOwned: { pageSize: true, filterKeys: ['number'] },
    },
);
tableState.value.sort = sortToState(history.sort.value as never, baseColumns);

function update(next: Partial<BulkHistoryFilters>): void {
    history.filters.value = { ...history.filters.value, ...next };
}
watch(
    () => tableState.value.filters.number,
    search => {
        if (search !== history.filters.value.search) update({ search: String(search) });
    },
);
watch(
    () => history.filters.value.search,
    search => {
        if (search !== tableState.value.filters.number) tableState.value.filters.number = search;
    },
);
watch(
    () => tableState.value.sort,
    s => {
        history.sort.value = sortFromState(s, baseColumns) as unknown as HistorySort;
    },
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => {
        history.pageSize.value = size;
    },
);

const operationTitle = (type: string): string =>
    history.operations.value.find(o => o.type === type)?.title ?? type;

const rows = computed(() =>
    history.items.value.map(b => ({
        uuid: b.uuid,
        number: b.number,
        type: b.operationType,
        createdAt: b.createdAt as string,
        operation: operationTitle(b.operationType),
        createdBy: b.createdByName ?? '—',
        records: b.totalCount,
        status: b.status,
        batch: b,
    })),
);
type Row = (typeof rows.value)[number];

const chips = computed<FilterChip[]>(() =>
    HISTORY_VIEWS.map(v => ({
        key: v.key,
        label: t(`bulkOperations.history.views.${v.key}`),
        variant: v.status ? BATCH_STATUS_VARIANT[v.status] : undefined,
        count: history.viewCounts.value?.[v.key],
        countLoading: history.viewCounts.value === null,
    })),
);

const viewsKey = 'bulk-history';
const openedWithLink = ['search', 'view', 'filters', 'sortField', 'pageSize'].some(
    k => k in useRoute().query,
);

function captureView(): TableViewState {
    return {
        filters: { ...history.filters.value },
        sort: { ...history.sort.value },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}
function applyView(state: TableViewState): void {
    const sort = sortToState(state.sort as never, baseColumns);
    tableState.value.sort = sort;
    history.sort.value = sortFromState(sort, baseColumns) as unknown as HistorySort;
    history.filters.value = { ...state.filters };
}

const router = useRouter();
function openBatch(batch: BulkBatch): void {
    void router.push({
        path: `/bulk-operations/${batch.operationType}`,
        query: { batch: batch.uuid },
    });
}
function onRowClick(event: AdvancedDataTableRowClickPayload<Row>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    openBatch(event.row.batch);
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="columns"
        :rows="rows"
        :loading="history.loading.value"
        :total-items="history.totalItems.value"
        :page="history.page.value"
        data-key="uuid"
        :row-height-px="56"
        :header-height-px="65"
        :search="{ filterKey: 'number', placeholder: t('bulkOperations.history.searchPlaceholder') }"
        :conditions="history.filters.value.conditions"
        :default-filters="{ number: '' }"
        :empty-message="t('bulkOperations.history.empty')"
        @update:conditions="update({ conditions: $event })"
        @update:page="history.page.value = $event"
        @reset-page="history.page.value = 1"
        @clear-filters="history.filters.value = { ...BLANK_HISTORY_FILTERS }"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="history.failed.value"
                :title="t('bulkOperations.history.loadFailedTitle')"
                :message="t('bulkOperations.history.loadFailedMessage')"
                @retry="history.reload"
            />
            <template v-else>{{
                history.loading.value ? '' : t('bulkOperations.history.noMatch')
            }}</template>
        </template>

        <template #toolbar-start>
            <MvFilterChips
                :chips="chips"
                :active="history.filters.value.view"
                @select="update({ view: $event })"
            />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                :views-key="viewsKey"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <RouterLink
                :to="{
                    path: `/bulk-operations/${(data as Row).type}`,
                    query: { batch: (data as Row).uuid },
                }"
                >{{ formatDocumentNumber((data as Row).number) }}</RouterLink
            >
        </template>
        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as Row).createdAt" />
        </template>
        <template #cell-result="{ data }">
            <div class="bulk-history-table__result">
                <MvStatusBadge :variant="BATCH_STATUS_VARIANT[(data as Row).status] ?? 'neutral'">{{
                    batchStatusLabel((data as Row).status)
                }}</MvStatusBadge>
                <span class="bulk-history-table__counts">
                    {{
                        t('bulkOperations.history.counts', {
                            applied: (data as Row).batch.appliedCount,
                            skipped: (data as Row).batch.skippedCount,
                            failed: (data as Row).batch.failedCount,
                        })
                    }}
                </span>
            </div>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.bulk-history-table__result {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
}

.bulk-history-table__counts {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}
</style>
