<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    useDataTableState,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    BLANK_SETTLEMENTS_FILTERS,
    restoreSettlementsFilters,
    type SettlementsListFilters,
    type SettlementsSort,
} from '../../api/settlementsList';
import { SETTLEMENTS_URL_DEFAULTS } from '../../composables/settlementsListUrl';
import { sortFromState, sortToState } from './settlementsSort';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    SETTLEMENTS_COLUMNS as COLUMNS,
    SETTLEMENTS_DEFAULT_HIDDEN,
    TEXT_OPERATORS,
} from './settlementsColumns';
import type { SettlementRow } from './settlementsRows';

const props = defineProps<{
    rows: SettlementRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: SettlementsListFilters;
    sort: SettlementsSort;
    administratorId: string;
    typeOptions: FilterOption[];
    organizationOptions: FilterOption[];
}>();

const emit = defineEmits<{
    'update:filters': [filters: SettlementsListFilters];
    'update:sort': [sort: SettlementsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const filterColumns = computed(() =>
    COLUMNS.map(c => {
        const options =
            c.field === 'type'
                ? props.typeOptions
                : c.field === 'organization'
                  ? props.organizationOptions
                  : null;
        if (options === null) return c;
        if (options.length) return { ...c, filterOptions: options };
        return { ...c, filterType: 'string' as const, filterOperators: [...TEXT_OPERATORS] };
    }),
);

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `settlements-list-v1:${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [...SETTLEMENTS_DEFAULT_HIDDEN],
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
function onConditions(conditions: SettlementsListFilters['conditions']): void {
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

const openedWithLink = Object.keys(SETTLEMENTS_URL_DEFAULTS).some(k => k in useRoute().query);

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
        { field: state.sort.field as SettlementsSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restoreSettlementsFilters(state.filters));
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="filterColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="64"
        :header-height-px="65"
        :search="{ filterKey: 'search', placeholder: 'Number, customer or order…' }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_SETTLEMENTS_FILTERS.search }"
        empty-message="No settlement documents match your filters"
        @update:conditions="onConditions"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                title="Could not load settlement documents"
                message="Check the connection and try again."
                @retry="emit('retry')"
            />
            <template v-else>{{
                loading ? '' : 'No settlement documents match your filters'
            }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="settlements"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <span class="mv-cell-id">{{ (data as SettlementRow).number }}</span>
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as SettlementRow).date" />
        </template>

        <template #cell-type="{ data }">
            <MvStatusBadge
                clamp
                :title="(data as SettlementRow).type"
                :variant="(data as SettlementRow).typeVariant"
                >{{ (data as SettlementRow).type }}</MvStatusBadge
            >
        </template>

        <template #cell-customer="{ data }">
            <RouterLink
                v-if="(data as SettlementRow).counterpartyId"
                class="mv-cell-primary mv-cell-link"
                :title="(data as SettlementRow).customer"
                :to="`/customers/${(data as SettlementRow).counterpartyId}`"
                >{{ (data as SettlementRow).customer }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-order="{ data }">
            <template v-if="(data as SettlementRow).orderCodes.length">
                <RouterLink
                    class="mv-cell-id mv-cell-id--inline mv-cell-link"
                    :to="`/orders/${(data as SettlementRow).orderCodes[0]}`"
                    >{{ formatDocumentNumber((data as SettlementRow).orderCodes[0]) }}</RouterLink
                >
                <span
                    v-if="(data as SettlementRow).orderCodes.length > 1"
                    class="mv-cell-more"
                    role="note"
                    :aria-label="`Also orders: ${(data as SettlementRow).orderCodes.slice(1).map(formatDocumentNumber).join(', ')}`"
                    :title="(data as SettlementRow).orderCodes.map(formatDocumentNumber).join(', ')"
                    >+{{ (data as SettlementRow).orderCodes.length - 1 }}</span
                >
            </template>
            <template v-else>—</template>
        </template>

        <template #cell-contract="{ data }">
            <span class="mv-cell-meta" :title="(data as SettlementRow).contract">{{
                (data as SettlementRow).contract
            }}</span>
        </template>

        <template #cell-organization="{ data }">
            <span class="mv-cell-meta" :title="(data as SettlementRow).organization">{{
                (data as SettlementRow).organization
            }}</span>
        </template>

        <template #cell-amount="{ data }">
            <span class="mv-cell-amount">{{ (data as SettlementRow).amount }}</span>
        </template>

        <template #cell-proformaInvoice="{ data }">
            <RouterLink
                v-if="(data as SettlementRow).proformaInvoice"
                class="mv-cell-id mv-cell-link"
                :to="{
                    path: '/proforma-invoices',
                    query: { search: (data as SettlementRow).proformaInvoice },
                }"
                >{{ formatDocumentNumber((data as SettlementRow).proformaInvoice) }}</RouterLink
            >
            <template v-else>—</template>
        </template>
    </MvAdvancedDataTable>
</template>
