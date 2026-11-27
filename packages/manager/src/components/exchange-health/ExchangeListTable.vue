<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    MvFilterChips,
    MvStatusBadge,
    useDataTableState,
    type FilterChip,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import { BLANK_FILTERS, useExchangeList } from '../../composables/useExchangeList';
import type { TableViewState } from '../../composables/tableViewState';
import { sortFromState, sortToState } from '../orders/ordersTableFilters';
import TableViewsMenu from '../TableViewsMenu.vue';
import type { ExchangeListConfig } from './lists';

const props = defineProps<{ config: ExchangeListConfig; administratorId: string }>();
const { config } = props;
const { columns, cells, hidden } = config.definition;
const { t, te } = useI18n();
const list = useExchangeList(config.source);
const searchField = config.searchField;
const sortable = columns.filter(c => c.sortField);

const { state: tableState } = useDataTableState<{ [key: string]: unknown }>(
    `exchange-${config.id}:${props.administratorId}`,
    {
        columnOrder: columns.map(c => c.field),
        columnWidths: Object.fromEntries(columns.map(c => [c.field, c.width])),
        hiddenColumns: hidden,
        sort: sortToState(list.sort.value as never, columns),
        filters: searchField ? { [searchField]: list.filters.value.search } : {},
        pageSize: list.pageSize.value,
    },
    {
        columns,
        allowedFilterKeys: [],
        externallyOwned: { pageSize: true, filterKeys: searchField ? [searchField] : [] },
    },
);
tableState.value.sort = sortToState(list.sort.value as never, columns);

function update(next: Partial<typeof BLANK_FILTERS>): void {
    list.filters.value = { ...list.filters.value, ...next };
}
if (searchField) {
    watch(
        () => tableState.value.filters[searchField],
        search => {
            if (search !== list.filters.value.search) update({ search: String(search ?? '') });
        },
    );
    watch(
        () => list.filters.value.search,
        search => {
            if (search !== tableState.value.filters[searchField])
                tableState.value.filters[searchField] = search;
        },
    );
}
if (sortable.length) {
    watch(
        () => tableState.value.sort,
        s => {
            list.sort.value = sortFromState(s, columns) as never;
        },
        { deep: true },
    );
}
watch(
    () => tableState.value.pageSize,
    size => {
        list.pageSize.value = size;
    },
);

const rows = computed(() => list.items.value.map(item => config.toRow(item)));
type Row = (typeof rows.value)[number];
const text = (row: Row, field: string): string => {
    const value = row[field];
    return value === null || value === undefined || value === '' ? '—' : String(value);
};

const statusVariant = cells.status?.kind === 'badge' ? cells.status.variant : undefined;
const chips = computed<FilterChip[]>(() =>
    config.source.views.map(key => ({
        key,
        label: t(`exchangeHealth.views.${config.id}.${key}`),
        variant: key === 'all' ? undefined : statusVariant?.(key),
        count: list.viewCounts.value?.[key],
        countCapped: list.viewCapped.value[key],
        countLoading: list.viewCounts.value === null,
    })),
);

function badgeVariant(field: string, value: string): StatusBadgeVariant {
    const spec = cells[field];
    return spec?.kind === 'badge' ? spec.variant(value) : 'neutral';
}

function badgeLabel(value: string): string {
    const key = `exchangeHealth.status.${config.id}.${value}`;
    return te(key) ? t(key) : value;
}

const viewsKey = `exchange-${config.id}`;
const openedWithLink = ['search', 'view', 'filters', 'sortField', 'pageSize'].some(
    k => k in useRoute().query,
);
function captureView(): TableViewState {
    return {
        filters: { ...list.filters.value },
        sort: { ...list.sort.value },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}
function applyView(state: TableViewState): void {
    if (sortable.length) {
        const sort = sortToState(state.sort as never, columns);
        tableState.value.sort = sort;
        list.sort.value = sortFromState(sort, columns) as never;
    }
    list.filters.value = { ...state.filters };
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="columns"
        :rows="rows"
        :loading="list.loading.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        data-key="id"
        :row-height-px="config.id === 'reconciliation' ? 56 : 64"
        :header-height-px="65"
        :search="
            searchField
                ? {
                      filterKey: searchField,
                      placeholder: t(`exchangeHealth.lists.${config.id}.search`),
                  }
                : undefined
        "
        :conditions="list.filters.value.conditions"
        :default-filters="searchField ? { [searchField]: '' } : {}"
        :empty-message="t(`exchangeHealth.lists.${config.id}.empty`)"
        @update:conditions="update({ conditions: $event })"
        @update:page="list.page.value = $event"
        @reset-page="list.page.value = 1"
        @clear-filters="list.filters.value = { ...BLANK_FILTERS, view: config.source.views[0] }"
    >
        <template #empty>
            <MvErrorState
                v-if="list.failed.value"
                :title="t('exchangeHealth.common.loadFailedTitle')"
                :message="t('exchangeHealth.common.loadFailedMessage')"
                @retry="list.reload"
            />
            <template v-else>{{
                list.loading.value ? '' : t(`exchangeHealth.lists.${config.id}.noMatch`)
            }}</template>
        </template>

        <template v-if="config.source.views.length > 1" #toolbar-start>
            <MvFilterChips
                :chips="chips"
                :active="list.filters.value.view"
                @select="update({ view: $event })"
            />
            <small v-if="list.totalItemsCapped.value" class="exchange-list__capped">{{
                t('exchangeHealth.common.cappedTotal', { count: list.totalItems.value })
            }}</small>
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

        <template v-for="c in columns" :key="c.field" #[`cell-${c.field}`]="{ data }">
            <template v-if="cells[c.field]?.kind === 'date'">
                <MvDateTimeCell
                    v-if="(data as Row)[c.field]"
                    :value="String((data as Row)[c.field])"
                />
                <span v-else>—</span>
            </template>
            <code v-else-if="cells[c.field]?.kind === 'code'" class="exchange-list__code">{{
                text(data as Row, c.field)
            }}</code>
            <span v-else-if="cells[c.field]?.kind === 'wrap'" class="exchange-list__wrap">{{
                text(data as Row, c.field)
            }}</span>
            <span v-else-if="cells[c.field]?.kind === 'entity'" class="exchange-list__entity">
                <strong>{{ (data as Row).entityType }}</strong>
                <code class="exchange-list__code">{{ (data as Row).entityId }}</code>
            </span>
            <MvStatusBadge
                v-else-if="cells[c.field]?.kind === 'badge'"
                :variant="badgeVariant(c.field, String((data as Row)[c.field]))"
                >{{ badgeLabel(String((data as Row)[c.field])) }}</MvStatusBadge
            >
            <span v-else>{{ text(data as Row, c.field) }}</span>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.exchange-list__code {
    font-size: 12px;
    overflow-wrap: anywhere;
}

.exchange-list__capped {
    color: var(--el-text-color-secondary);
}

.exchange-list__wrap {
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.35;
}

.exchange-list__entity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
</style>
