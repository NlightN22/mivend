<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvAdvancedDataTable,
    MvButton,
    MvErrorState,
    MvProgressBar,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    BLANK_CUSTOMERS_FILTERS,
    restoreCustomersFilters,
    type CustomersListFilters,
    type CustomersSort,
} from '../../api/customersList';
import { CUSTOMERS_URL_DEFAULTS } from '../../composables/customersListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { sortFromState, sortToState } from '../bulk-operations/counterpartySort';
import { buildCustomersColumns, CUSTOMERS_DEFAULT_HIDDEN } from './customersColumns';
import { innStatusBadge, usageVariant, type CustomerRow } from './customersRows';

const props = defineProps<{
    rows: CustomerRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: CustomersListFilters;
    sort: CustomersSort;
    administratorId: string;
    // Undefined hides the Manager filter (a manager's own book has nothing to choose).
    managerOptions: FilterOption[] | undefined;
    branchOptions: FilterOption[];
    urlPrefix?: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: CustomersListFilters];
    'update:sort': [sort: CustomersSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
    export: [];
}>();

const { t } = useI18n();

const COLUMNS = buildCustomersColumns({ managers: [] });
const filterColumns = computed(() =>
    buildCustomersColumns({ managers: props.managerOptions, branches: props.branchOptions }),
);

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `customers-list-v1:${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [...CUSTOMERS_DEFAULT_HIDDEN],
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

const openedWithLink = Object.keys(CUSTOMERS_URL_DEFAULTS).some(
    k => (props.urlPrefix ?? '') + k in useRoute().query,
);

const router = useRouter();
function onRowClick(event: AdvancedDataTableRowClickPayload<CustomerRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const href = router.resolve(`/customers/${event.row.id}`).href;
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
        { field: state.sort.field as CustomersSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restoreCustomersFilters(state.filters));
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
        :search="{ filterKey: 'search', placeholder: t('customers.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_CUSTOMERS_FILTERS.search }"
        :empty-message="t('customers.list.empty')"
        @update:conditions="emit('update:filters', { ...filters, conditions: $event })"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('customers.list.loadFailedTitle')"
                :message="t('customers.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('customers.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <MvButton size="sm" variant="secondary" @click="emit('export')">{{
                t('customers.list.exportPage')
            }}</MvButton>
            <TableViewsMenu
                views-key="customers"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-shortName="{ data }">
            <RouterLink
                class="mv-cell-primary mv-cell-link"
                :title="(data as CustomerRow).shortName"
                :to="`/customers/${(data as CustomerRow).id}`"
                >{{ (data as CustomerRow).shortName }}</RouterLink
            >
        </template>

        <template #cell-inn="{ data }">
            <span class="mv-cell-id">{{ (data as CustomerRow).inn || '—' }}</span>
        </template>

        <template #cell-manager="{ data }">
            <span class="mv-cell-meta" :title="(data as CustomerRow).manager">{{
                (data as CustomerRow).manager
            }}</span>
        </template>

        <template #cell-branch="{ data }">
            <span class="mv-cell-meta" :title="(data as CustomerRow).branch">{{
                (data as CustomerRow).branch || '—'
            }}</span>
        </template>

        <template #cell-group="{ data }">
            <span class="mv-cell-meta" :title="(data as CustomerRow).group">{{
                (data as CustomerRow).group || '—'
            }}</span>
        </template>

        <template #cell-innStatus="{ data }">
            <MvStatusBadge :variant="innStatusBadge((data as CustomerRow).innStatus).variant">{{
                innStatusBadge((data as CustomerRow).innStatus).label
            }}</MvStatusBadge>
        </template>

        <template #cell-contact="{ data }">
            <span class="mv-cell-meta" :title="(data as CustomerRow).contact">{{
                (data as CustomerRow).contact
            }}</span>
        </template>

        <template #cell-creditLimit="{ data }">
            <span class="mv-cell-amount">{{ (data as CustomerRow).creditLimit }}</span>
        </template>

        <template #cell-creditBalance="{ data }">
            <div
                v-if="(data as CustomerRow).creditUsagePercent !== null"
                class="customers-list-table__usage"
            >
                <span class="mv-cell-amount"
                    >{{ (data as CustomerRow).creditBalance }} ·
                    {{ Math.round((data as CustomerRow).creditUsagePercent ?? 0) }}%</span
                >
                <MvProgressBar
                    :value="(data as CustomerRow).creditUsagePercent ?? 0"
                    :max="100"
                    :variant="usageVariant((data as CustomerRow).creditUsagePercent ?? 0)"
                />
            </div>
            <span v-else class="mv-cell-amount">{{ (data as CustomerRow).creditBalance }}</span>
        </template>

        <template #cell-discounts="{ data }">
            <RouterLink
                v-if="(data as CustomerRow).discounts"
                class="mv-cell-link"
                :to="{ path: '/discounts', query: { search: (data as CustomerRow).shortName } }"
            >
                <MvStatusBadge variant="info">{{
                    t('customers.list.activeDiscounts', {
                        count: (data as CustomerRow).discounts,
                    })
                }}</MvStatusBadge>
            </RouterLink>
            <template v-else>—</template>
        </template>

        <template #cell-lastOrder="{ data }">
            <span class="mv-cell-meta">{{ (data as CustomerRow).lastOrder }}</span>
        </template>

        <template #cell-isActive="{ data }">
            <MvStatusBadge :variant="(data as CustomerRow).isActive ? 'success' : 'neutral'">{{
                t(
                    (data as CustomerRow).isActive
                        ? 'customers.list.status.active'
                        : 'customers.list.status.inactive',
                )
            }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.customers-list-table__usage {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
</style>
