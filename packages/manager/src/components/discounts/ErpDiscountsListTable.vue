<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import {
    MvAdvancedDataTable,
    MvErrorState,
    MvStatusBadge,
    useDataTableState,
} from '@mivend/ui-kit';
import {
    BLANK_ERP_DISCOUNTS_FILTERS,
    restoreErpDiscountsFilters,
    type ErpDiscountsListFilters,
    type ErpDiscountsSort,
} from '../../api/erpDiscountsList';
import { ERP_DISCOUNTS_URL_DEFAULTS } from '../../composables/erpDiscountsListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { ERP_DISCOUNTS_COLUMNS, ERP_DISCOUNTS_HIDDEN_BY_DEFAULT } from './erpDiscountsColumns';
import type { ErpDiscountRow } from './erpDiscountsRows';
import { erpSortFromState, erpSortToState } from './erpDiscountsSort';

const props = defineProps<{
    rows: ErpDiscountRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: ErpDiscountsListFilters;
    sort: ErpDiscountsSort;
    administratorId: string;
    nested?: boolean;
    urlPrefix?: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: ErpDiscountsListFilters];
    'update:sort': [sort: ErpDiscountsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const COLUMNS = ERP_DISCOUNTS_COLUMNS;

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `erp-discounts-list-v1:${props.nested ? 'nested:' : ''}${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [...ERP_DISCOUNTS_HIDDEN_BY_DEFAULT],
        sort: erpSortToState(props.sort, COLUMNS),
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

tableState.value.sort = erpSortToState(props.sort, COLUMNS);

// The chips own `view`; the table never emits it, the parent merges it back in.
watch(
    () => tableState.value.filters.search,
    search => {
        if (search !== props.filters.search) emit('update:filters', { ...props.filters, search });
    },
);
watch(
    () => tableState.value.sort,
    s => emit('update:sort', erpSortFromState(s, COLUMNS)),
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

const route = useRoute();
const openedWithLink = Object.keys(ERP_DISCOUNTS_URL_DEFAULTS).some(
    k => (props.urlPrefix ?? '') + k in route.query,
);

function captureView(): TableViewState {
    return {
        filters: { search: props.filters.search, view: props.filters.view, conditions: [] },
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
    const sort = erpSortToState(
        { field: state.sort.field as ErpDiscountsSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', erpSortFromState(sort, COLUMNS));
    emit('update:filters', restoreErpDiscountsFilters(state.filters));
}

const dateLabel = (value: string): string => new Date(value).toLocaleDateString('en-US');
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="64"
        :header-height-px="65"
        :search="{ filterKey: 'search', placeholder: 'Number or customer…' }"
        :default-filters="{ search: BLANK_ERP_DISCOUNTS_FILTERS.search }"
        empty-message="No ERP discounts match your filters"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                title="Could not load ERP discounts"
                message="Check the connection and try again."
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : 'No ERP discounts match your filters' }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="erp-discounts"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <span class="mv-cell-id">{{ (data as ErpDiscountRow).number }}</span>
        </template>

        <template #cell-validFrom="{ data }">{{
            dateLabel((data as ErpDiscountRow).validFrom)
        }}</template>

        <template #cell-customer="{ data }">
            <span
                class="mv-cell-primary"
                :title="(data as ErpDiscountRow).customer.title ?? undefined"
            >
                <RouterLink
                    v-if="(data as ErpDiscountRow).customer.href"
                    class="mv-cell-link"
                    :to="(data as ErpDiscountRow).customer.href as string"
                    @click.stop
                    >{{ (data as ErpDiscountRow).customer.label }}</RouterLink
                >
                <template v-else>{{ (data as ErpDiscountRow).customer.label }}</template
                >{{ (data as ErpDiscountRow).customer.suffix }}
            </span>
        </template>

        <template #cell-percent="{ data }">
            <span class="erp-discounts-list-table__percent">
                {{ (data as ErpDiscountRow).percentLabel }}
                <MvStatusBadge
                    v-if="(data as ErpDiscountRow).markup"
                    variant="warning"
                    title="A negative discount: the price goes up"
                    >Markup</MvStatusBadge
                >
            </span>
        </template>

        <template #cell-validTo="{ data }">{{
            (data as ErpDiscountRow).validTo
                ? dateLabel((data as ErpDiscountRow).validTo as string)
                : 'No end date'
        }}</template>

        <template #cell-status="{ data }">
            <MvStatusBadge
                :variant="(data as ErpDiscountRow).statusVariant"
                :title="(data as ErpDiscountRow).inactiveReason ?? undefined"
                >{{ (data as ErpDiscountRow).statusLabel }}</MvStatusBadge
            >
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.erp-discounts-list-table__percent {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
}
</style>
