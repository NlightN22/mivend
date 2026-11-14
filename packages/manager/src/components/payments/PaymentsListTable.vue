<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    type AdvancedDataTableRowClickPayload,
    MvErrorState,
    useDataTableState,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    BLANK_PAYMENTS_FILTERS,
    restorePaymentsFilters,
    type PaymentsListFilters,
    type PaymentsSort,
} from '../../api/paymentsList';
import { PAYMENTS_URL_DEFAULTS } from '../../composables/paymentsListUrl';
import { sortFromState, sortToState } from './paymentsSort';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildPaymentsColumns } from './paymentsColumns';
import type { PaymentRow } from './paymentsRows';

const { t } = useI18n();
const COLUMNS = buildPaymentsColumns();
// Display columns are rebuilt on a language switch; COLUMNS only feeds the persisted state.
const displayColumns = computed(() => buildPaymentsColumns());

const props = defineProps<{
    rows: PaymentRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: PaymentsListFilters;
    sort: PaymentsSort;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: PaymentsListFilters];
    'update:sort': [sort: PaymentsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `payments-list-v1:${props.administratorId}`,
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
function onConditions(conditions: PaymentsListFilters['conditions']): void {
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

const openedWithLink = Object.keys(PAYMENTS_URL_DEFAULTS).some(k => k in useRoute().query);

const router = useRouter();
function onRowClick(event: AdvancedDataTableRowClickPayload<PaymentRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const href = router.resolve(`/payments/${event.row.id}`).href;
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
        { field: state.sort.field as PaymentsSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restorePaymentsFilters(state.filters));
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="displayColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="64"
        :header-height-px="65"
        :search="{ filterKey: 'search', placeholder: t('payments.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_PAYMENTS_FILTERS.search }"
        :empty-message="t('payments.list.empty')"
        @update:conditions="onConditions"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('payments.list.loadFailedTitle')"
                :message="t('payments.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('payments.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="payments"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <RouterLink
                class="mv-cell-id mv-cell-link"
                :to="`/payments/${(data as PaymentRow).id}`"
                >{{ formatDocumentNumber((data as PaymentRow).number) }}</RouterLink
            >
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as PaymentRow).createdAt" />
        </template>

        <template #cell-customer="{ data }">
            <RouterLink
                v-if="(data as PaymentRow).counterpartyId"
                class="mv-cell-primary mv-cell-link"
                :title="(data as PaymentRow).customer"
                :to="`/customers/${(data as PaymentRow).counterpartyId}`"
                >{{ (data as PaymentRow).customer }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-proformaInvoice="{ data }">
            <RouterLink
                v-if="(data as PaymentRow).proformaInvoice"
                class="mv-cell-id mv-cell-link"
                :to="{
                    path: '/proforma-invoices',
                    query: { search: (data as PaymentRow).proformaInvoice },
                }"
                >{{ formatDocumentNumber((data as PaymentRow).proformaInvoice) }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-order="{ data }">
            <RouterLink
                v-if="(data as PaymentRow).orderCode"
                class="mv-cell-id mv-cell-link"
                :to="`/orders/${(data as PaymentRow).orderCode}`"
                >{{ formatDocumentNumber((data as PaymentRow).orderCode) }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as PaymentRow).statusVariant">{{
                (data as PaymentRow).status
            }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
