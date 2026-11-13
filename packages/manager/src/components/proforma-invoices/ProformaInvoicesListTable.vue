<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    useDataTableState,
    formatDocumentNumber,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import {
    BLANK_PROFORMA_INVOICES_FILTERS,
    restoreProformaInvoicesFilters,
    type ProformaInvoicesListFilters,
    type ProformaInvoicesSort,
} from '../../api/proformaInvoicesList';
import { PROFORMA_INVOICES_URL_DEFAULTS } from '../../composables/proformaInvoicesListUrl';
import { sortFromState, sortToState } from './proformaInvoicesSort';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildProformaInvoicesColumns } from './proformaInvoicesColumns';
import type { ProformaInvoiceRow } from './proformaInvoicesRows';

const { t } = useI18n();

const props = defineProps<{
    rows: ProformaInvoiceRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: ProformaInvoicesListFilters;
    sort: ProformaInvoicesSort;
    administratorId: string;
    nested?: boolean;
    urlPrefix?: string;
}>();

// Nested under a customer, the customer column and filter are redundant.
const COLUMNS = buildProformaInvoicesColumns().filter(c => !props.nested || c.field !== 'customer');

const emit = defineEmits<{
    'update:filters': [filters: ProformaInvoicesListFilters];
    'update:sort': [sort: ProformaInvoicesSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `proforma-invoices-list-v2:${props.nested ? 'nested:' : ''}${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
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
function onConditions(conditions: ProformaInvoicesListFilters['conditions']): void {
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

const openedWithLink = Object.keys(PROFORMA_INVOICES_URL_DEFAULTS).some(
    k => (props.urlPrefix ?? '') + k in useRoute().query,
);

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
        { field: state.sort.field as ProformaInvoicesSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restoreProformaInvoicesFilters(state.filters));
}

const router = useRouter();
function onRowClick(event: AdvancedDataTableRowClickPayload<ProformaInvoiceRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const href = router.resolve(`/proforma-invoices/${event.row.id}`).href;
    const mouse = event.originalEvent as MouseEvent;
    if (mouse.ctrlKey || mouse.metaKey) window.open(href, '_blank', 'noopener');
    else void router.push(href);
}
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
        :search="{ filterKey: 'search', placeholder: t('proformaInvoices.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_PROFORMA_INVOICES_FILTERS.search }"
        :empty-message="t('proformaInvoices.list.empty')"
        @update:conditions="onConditions"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('proformaInvoices.list.loadFailedTitle')"
                :message="t('proformaInvoices.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('proformaInvoices.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="proforma-invoices"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <RouterLink
                class="mv-cell-id mv-cell-id--inline mv-cell-link"
                :to="`/proforma-invoices/${(data as ProformaInvoiceRow).id}`"
                >{{ formatDocumentNumber((data as ProformaInvoiceRow).number) }}</RouterLink
            >
            <MvStatusBadge
                v-if="(data as ProformaInvoiceRow).version > 1"
                class="proforma-invoices-list-table__version"
                variant="info"
                >v{{ (data as ProformaInvoiceRow).version }}</MvStatusBadge
            >
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as ProformaInvoiceRow).createdAt" />
        </template>

        <template #cell-customer="{ data }">
            <div class="mv-cell-primary" :title="(data as ProformaInvoiceRow).customer">
                {{ (data as ProformaInvoiceRow).customer }}
            </div>
        </template>

        <template #cell-order="{ data }">
            <RouterLink
                v-if="(data as ProformaInvoiceRow).orderCode"
                class="mv-cell-id mv-cell-link"
                :to="`/orders/${(data as ProformaInvoiceRow).orderCode}`"
                >{{ formatDocumentNumber((data as ProformaInvoiceRow).orderCode) }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as ProformaInvoiceRow).statusVariant">{{
                (data as ProformaInvoiceRow).status
            }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped src="./ProformaInvoicesListTable.css"></style>
