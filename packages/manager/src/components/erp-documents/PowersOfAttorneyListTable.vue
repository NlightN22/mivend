<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    MvStatusBadge,
    useDataTableState,
} from '@mivend/ui-kit';
import {
    BLANK_POWERS_OF_ATTORNEY_FILTERS,
    restorePowersOfAttorneyFilters,
    type PowersOfAttorneyListFilters,
    type PowersOfAttorneySort,
} from '../../api/powersOfAttorneyList';
import { POWERS_OF_ATTORNEY_URL_DEFAULTS } from '../../composables/powersOfAttorneyListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import TableViewsMenu from '../TableViewsMenu.vue';
import { POWER_OF_ATTORNEY_COLUMNS as COLUMNS } from './powersOfAttorneyColumns';
import { sortFromState, sortToState } from './powersOfAttorneySort';
import type { PowerOfAttorneyTableRow } from './powersOfAttorneyRows';

const { t } = useI18n();

const props = defineProps<{
    rows: PowerOfAttorneyTableRow[];
    loading: boolean;
    failed: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: PowersOfAttorneyListFilters;
    sort: PowersOfAttorneySort;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: PowersOfAttorneyListFilters];
    'update:sort': [sort: PowersOfAttorneySort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const { state: tableState } = useDataTableState<{ [key: string]: unknown; search: string }>(
    `powers-of-attorney-v1:${props.administratorId}`,
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

const openedWithLink = Object.keys(POWERS_OF_ATTORNEY_URL_DEFAULTS).some(
    k => k in useRoute().query,
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
        { field: state.sort.field as PowersOfAttorneySort['field'], dir: state.sort.dir },
        COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, COLUMNS));
    emit('update:filters', restorePowersOfAttorneyFilters(state.filters));
}

const row = (data: unknown): PowerOfAttorneyTableRow => data as PowerOfAttorneyTableRow;
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
        :search="{
            filterKey: 'search',
            placeholder: t('erpDocuments.powerOfAttorney.list.searchPlaceholder'),
        }"
        :conditions="filters.conditions"
        :default-filters="{ search: BLANK_POWERS_OF_ATTORNEY_FILTERS.search }"
        :empty-message="t('erpDocuments.powerOfAttorney.list.empty')"
        @update:conditions="emit('update:filters', { ...filters, conditions: $event })"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('erpDocuments.powerOfAttorney.list.loadFailedTitle')"
                :message="t('erpDocuments.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{
                loading ? '' : t('erpDocuments.powerOfAttorney.list.empty')
            }}</template>
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                views-key="powers-of-attorney"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-number="{ data }">
            <span class="mv-cell-id">{{ row(data).number }}</span>
        </template>

        <template #cell-holder="{ data }">
            <span class="mv-cell-primary" :title="row(data).holder">{{ row(data).holder }}</span>
        </template>

        <template #cell-validFrom="{ data }">
            <MvDateTimeCell v-if="row(data).validFrom" :value="row(data).validFrom" />
            <template v-else>—</template>
        </template>

        <template #cell-validUntil="{ data }">
            <MvDateTimeCell v-if="row(data).validUntil" :value="row(data).validUntil" />
            <template v-else>{{ t('erpDocuments.powerOfAttorney.unlimited') }}</template>
        </template>

        <template #cell-status="{ data }">
            <MvStatusBadge :variant="row(data).status === 'expired' ? 'danger' : 'success'">{{
                t(`erpDocuments.powerOfAttorney.status.${row(data).status}`)
            }}</MvStatusBadge>
        </template>

        <template #cell-customer="{ data }">
            <RouterLink
                v-if="row(data).counterpartyId"
                class="mv-cell-primary mv-cell-link"
                :title="row(data).customer"
                :to="`/customers/${row(data).counterpartyId}`"
                >{{ row(data).customer }}</RouterLink
            >
            <template v-else>—</template>
        </template>

        <template #cell-contract="{ data }">
            <span class="mv-cell-meta" :title="row(data).contract">{{ row(data).contract }}</span>
            <MvStatusBadge v-if="row(data).contractDeleted" variant="warning">{{
                t('erpDocuments.powerOfAttorney.contractDeleted')
            }}</MvStatusBadge>
        </template>

        <template #cell-scan="{ data }">
            <span class="mv-cell-meta" :title="row(data).scanId">{{
                row(data).hasScan
                    ? t('erpDocuments.powerOfAttorney.scanPresent')
                    : t('erpDocuments.powerOfAttorney.scanMissing')
            }}</span>
        </template>
    </MvAdvancedDataTable>
</template>
