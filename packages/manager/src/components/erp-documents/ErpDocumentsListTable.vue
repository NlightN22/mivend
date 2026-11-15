<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    useDataTableState,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    BLANK_ERP_DOCUMENTS_FILTERS,
    restoreErpDocumentsFilters,
    type ErpDocumentsListFilters,
    type ErpDocumentsSort,
} from '../../api/erpDocumentsList';
import type { ErpDocumentKind } from '../../api/erpDocumentKinds';
import { ERP_DOCUMENTS_URL_DEFAULTS } from '../../composables/erpDocumentsListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { erpDocumentColumns, ERP_DOCUMENT_DEFAULT_HIDDEN } from './erpDocumentsColumns';
import { sortFromState, sortToState } from './erpDocumentsSort';
import type { ErpDocumentTableRow } from './erpDocumentsRows';

const { t } = useI18n();

const props = defineProps<{
    kind: ErpDocumentKind;
    rows: ErpDocumentTableRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: ErpDocumentsListFilters;
    sort: ErpDocumentsSort;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: ErpDocumentsListFilters];
    'update:sort': [sort: ErpDocumentsSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const COLUMNS = erpDocumentColumns(props.kind);

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `erp-documents-${props.kind}-v1:${props.administratorId}`,
    {
        columnOrder: COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: ERP_DOCUMENT_DEFAULT_HIDDEN.filter(f => COLUMNS.some(c => c.field === f)),
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

const openedWithLink = Object.keys(ERP_DOCUMENTS_URL_DEFAULTS).some(k => k in useRoute().query);

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
        { field: state.sort.field as ErpDocumentsSort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restoreErpDocumentsFilters(state.filters));
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
        :search="{ filterKey: 'search', placeholder: t('erpDocuments.list.searchPlaceholder') }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_ERP_DOCUMENTS_FILTERS.search }"
        :empty-message="t('erpDocuments.list.empty')"
        @update:conditions="emit('update:filters', { ...filters, conditions: $event })"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('erpDocuments.list.loadFailedTitle')"
                :message="t('erpDocuments.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('erpDocuments.list.empty') }}</template>
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                :views-key="`erp-documents-${kind}`"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <span class="mv-cell-id">{{ (data as ErpDocumentTableRow).number }}</span>
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell
                v-if="(data as ErpDocumentTableRow).date"
                :value="(data as ErpDocumentTableRow).date"
            />
            <template v-else>—</template>
        </template>

        <template #cell-customer="{ data }">
            <RouterLink
                v-if="(data as ErpDocumentTableRow).counterpartyId"
                class="mv-cell-primary mv-cell-link"
                :title="(data as ErpDocumentTableRow).customer"
                :to="`/customers/${(data as ErpDocumentTableRow).counterpartyId}`"
                >{{ (data as ErpDocumentTableRow).customer }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-order="{ data }">
            <RouterLink
                v-if="(data as ErpDocumentTableRow).orderCode"
                class="mv-cell-id mv-cell-link"
                :to="`/orders/${(data as ErpDocumentTableRow).orderCode}`"
                >{{ formatDocumentNumber((data as ErpDocumentTableRow).orderCode) }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-products="{ data }">
            <span class="mv-cell-meta" :title="(data as ErpDocumentTableRow).products">{{
                (data as ErpDocumentTableRow).products || '—'
            }}</span>
            <span v-if="(data as ErpDocumentTableRow).moreProducts" class="mv-cell-more"
                >+{{ (data as ErpDocumentTableRow).moreProducts }}</span
            >
        </template>

        <template #cell-contract="{ data }">
            <span class="mv-cell-meta" :title="(data as ErpDocumentTableRow).contract">{{
                (data as ErpDocumentTableRow).contract
            }}</span>
        </template>

        <template #cell-organization="{ data }">
            <span class="mv-cell-meta" :title="(data as ErpDocumentTableRow).organization">{{
                (data as ErpDocumentTableRow).organization
            }}</span>
        </template>

        <template #cell-comment="{ data }">
            <span class="mv-cell-meta" :title="(data as ErpDocumentTableRow).comment">{{
                (data as ErpDocumentTableRow).comment || '—'
            }}</span>
        </template>

        <template #cell-amount="{ data }">
            <span class="mv-cell-amount">{{ (data as ErpDocumentTableRow).amount }}</span>
        </template>
    </MvAdvancedDataTable>
</template>
