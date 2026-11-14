<script setup lang="ts">
import { useDroppedFilterNotice } from '../../composables/useDroppedFilterNotice';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    type AdvancedDataTableColumn,
    MvButton,
    MvDateTimeCell,
    type AdvancedDataTableRowClickPayload,
    MvErrorState,
    MvNotice,
    useDataTableState,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    BLANK_DISCOUNTS_FILTERS,
    restoreDiscountsFilters,
    type DiscountsListFilters,
    type DiscountsSort,
} from '../../api/discountsList';
import { fetchFacets, fetchPriceTypeCodes } from '../../api/discounts';
import { DISCOUNTS_URL_DEFAULTS } from '../../composables/discountsListUrl';
import { sortFromState, sortToState } from './discountsSort';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildDiscountsColumns, DISCOUNTS_HIDDEN_BY_DEFAULT } from './discountsColumns';
import type { DiscountRow } from './discountsRows';
import { formatDate } from '../../i18n/format';

const props = defineProps<{
    rows: DiscountRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: DiscountsListFilters;
    sort: DiscountsSort;
    administratorId: string;
    nested?: boolean;
    urlPrefix?: string;
}>();

// Nested under a customer, the customer column is redundant; the scope column marks shared discounts.
const { t } = useI18n();
const visibleColumns = (): AdvancedDataTableColumn[] =>
    buildDiscountsColumns().filter(c => c.field !== (props.nested ? 'customer' : 'scope'));
const COLUMNS = visibleColumns();

const emit = defineEmits<{
    'update:filters': [filters: DiscountsListFilters];
    'update:sort': [sort: DiscountsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
    new: [];
    renew: [row: DiscountRow];
}>();

const groupOptions = ref<{ value: string; label: string }[]>([]);
const priceTypeOptions = ref<{ value: string; label: string }[]>([]);
const {
    dropped: droppedGroupFilter,
    markDropped,
    reset: resetDropped,
} = useDroppedFilterNotice(() => props.filters.view);
onMounted(async () => {
    const [codes, facets] = await Promise.allSettled([fetchPriceTypeCodes(), fetchFacets()]);
    if (codes.status === 'fulfilled') {
        priceTypeOptions.value = codes.value.map(code => ({ value: code, label: code }));
    }
    if (facets.status === 'fulfilled') {
        const byCode = new Map<string, string>();
        for (const v of facets.value.flatMap(f => f.values)) byCode.set(v.code, v.name);
        groupOptions.value = [...byCode]
            .map(([value, label]) => ({ value, label }))
            .sort((x, y) => x.label.localeCompare(y.label));
    }
});
const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    visibleColumns().map(c => {
        if (c.field === 'priceType') return { ...c, filterOptions: priceTypeOptions.value };
        if (c.field !== 'productGroup' || !groupOptions.value.length) return c;
        return {
            ...c,
            filterType: 'select' as const,
            filterOptions: groupOptions.value,
            filterOperators: ['eq', 'notEq'] as ('eq' | 'notEq')[],
        };
    }),
);

// Once the group select is live, text-operator conditions restored from a link or view cannot apply.
watch(
    () => [groupOptions.value, props.filters.conditions] as const,
    ([options, conditions]) => {
        if (!options.length) return;
        const kept = conditions.filter(
            c => c.columnKey !== 'productGroup' || c.operator === 'eq' || c.operator === 'notEq',
        );
        if (kept.length === conditions.length) return;
        markDropped();
        emit('update:filters', { ...props.filters, conditions: kept });
    },
);

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `discounts-list-v1:${props.nested ? 'nested:' : ''}${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [...DISCOUNTS_HIDDEN_BY_DEFAULT],
        sort: sortToState(props.sort, COLUMNS),
        filters: { search: props.filters.search },
        pageSize: props.pageSize,
    },
    {
        columns: COLUMNS,
        allowedFilterKeys: [],
        // Search and page size come from the URL, never from a previous session.
        externallyOwned: { pageSize: true, filterKeys: ['search'] },
    },
);

tableState.value.sort = sortToState(props.sort, COLUMNS);

// The chips own `view`; the table never emits it, the parent merges it back in.
watch(
    () => tableState.value.filters.search,
    search => {
        if (search !== props.filters.search) emit('update:filters', { ...props.filters, search });
    },
);
function onConditions(conditions: DiscountsListFilters['conditions']): void {
    resetDropped();
    emit('update:filters', { ...props.filters, conditions });
}
watch(
    () => tableState.value.sort,
    s => emit('update:sort', sortFromState(s, COLUMNS)),
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
        if (search !== tableState.value.filters.search) tableState.value.filters.search = search;
    },
);

const openedWithLink = Object.keys(DISCOUNTS_URL_DEFAULTS).some(
    k => (props.urlPrefix ?? '') + k in useRoute().query,
);

const router = useRouter();
// The request is the discount's card; an ERP-pushed rule has none.
function requestPath(row: DiscountRow): string | null {
    return row.approvalRequestId ? `/approvals/${row.approvalRequestId}` : null;
}
function onRowClick(event: AdvancedDataTableRowClickPayload<DiscountRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const path = requestPath(event.row);
    if (!path) return;
    const href = router.resolve(path).href;
    const mouse = event.originalEvent as MouseEvent;
    if (mouse.ctrlKey || mouse.metaKey) window.open(href, '_blank', 'noopener');
    else void router.push(href);
}

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
    const fields = COLUMNS.map(c => c.field);
    const order = state.columnOrder.filter(f => fields.includes(f));
    tableState.value.columnOrder = [...order, ...fields.filter(f => !order.includes(f))];
    tableState.value.hiddenColumns = state.hiddenColumns.filter(
        f => fields.includes(f) && !COLUMNS.find(c => c.field === f)?.required,
    );
    const sort = sortToState(
        { field: state.sort.field as DiscountsSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restoreDiscountsFilters(state.filters));
}

const dateLabel = (value: string): string => formatDate(value);
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
        :row-height-px="64"
        :header-height-px="65"
        :search="{ filterKey: 'search', placeholder: t('discounts.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_DISCOUNTS_FILTERS.search }"
        :empty-message="t('discounts.list.empty')"
        @update:conditions="onConditions"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('discounts.list.loadFailedTitle')"
                :message="t('discounts.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('discounts.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
            <MvNotice v-if="droppedGroupFilter" variant="warning">
                {{ t('discounts.list.droppedGroupFilter') }}
            </MvNotice>
        </template>

        <template #toolbar-end>
            <MvButton size="sm" @click="emit('new')">{{ t('discounts.list.newGrant') }}</MvButton>
            <TableViewsMenu
                views-key="discounts"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <RouterLink
                v-if="requestPath(data as DiscountRow)"
                class="mv-cell-id mv-cell-link"
                :to="requestPath(data as DiscountRow) as string"
                >{{ formatDocumentNumber((data as DiscountRow).number) }}</RouterLink
            >
            <span v-else class="mv-cell-id">{{
                formatDocumentNumber((data as DiscountRow).number)
            }}</span>
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as DiscountRow).createdAt" />
        </template>

        <template #cell-customer="{ data }">
            <span class="mv-cell-primary" :title="(data as DiscountRow).customer">{{
                (data as DiscountRow).customer
            }}</span>
        </template>

        <template #cell-scope="{ data }">
            <MvStatusBadge :variant="(data as DiscountRow).shared ? 'info' : 'neutral'">{{
                (data as DiscountRow).scope
            }}</MvStatusBadge>
        </template>

        <template #cell-percent="{ data }">
            <span :class="{ 'discounts-list-table__negative': (data as DiscountRow).percent < 0 }"
                >{{ (data as DiscountRow).percent }}%</span
            >
        </template>

        <template #cell-validFrom="{ data }">{{
            dateLabel((data as DiscountRow).validFrom)
        }}</template>

        <template #cell-validTo="{ data }">
            <span class="discounts-list-table__valid-to">
                {{ dateLabel((data as DiscountRow).validTo) }}
                <MvButton
                    v-if="(data as DiscountRow).status === 'expiring-soon'"
                    size="sm"
                    variant="ghost"
                    class="discounts-list-table__renew"
                    @click="emit('renew', data as DiscountRow)"
                    >{{ t('discounts.list.renew') }}</MvButton
                >
            </span>
        </template>

        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as DiscountRow).statusVariant">{{
                (data as DiscountRow).statusLabel
            }}</MvStatusBadge>
        </template>

        <template #cell-justification="{ data }">
            <span class="mv-cell-meta" :title="(data as DiscountRow).justification ?? ''">{{
                (data as DiscountRow).justification ?? '—'
            }}</span>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped src="./DiscountsListTable.css"></style>
