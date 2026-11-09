<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    MvAdvancedDataTable,
    MvErrorState,
    MvFilterChips,
    MvStatusBadge,
    useDataTableState,
    type FilterChip,
} from '@mivend/ui-kit';
import { activationReadiness } from '../../api/counterpartyPortalAccess';
import { ACTIVATION_VIEWS, BLANK_ACTIVATION_FILTERS } from '../../api/activationFilter';
import type { ActivationCandidatesState } from '../../composables/useActivationCandidates';
import type { TableViewState } from '../../composables/tableViewState';
import ActivationQuickFilters from './ActivationQuickFilters.vue';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildActivationColumns, DEFAULT_HIDDEN_COLUMNS } from './activationColumns';
import { READINESS_BADGE_VARIANT, readinessText, type Readiness } from './activationReadiness';
import { ACTIVATION_SORT_FIELDS, sortFromState, sortToState } from './counterpartySort';

// Rows of any readiness can be selected; the review step explains what will be skipped.
const props = defineProps<{
    list: ActivationCandidatesState;
    selectedIds: Set<string>;
    selectionLabel?: string;
    administratorId: string;
}>();
const emit = defineEmits<{ 'update:selectedIds': [ids: Set<string>] }>();
const list = props.list;

const baseColumns = buildActivationColumns([]);
const columns = computed(() => buildActivationColumns(list.branches.value));

const { state: tableState } = useDataTableState<{ [key: string]: unknown; shortName: string }>(
    `bulk-activation-select:${props.administratorId}`,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
        sort: sortToState(list.sort.value, baseColumns),
        filters: { shortName: list.filters.value.search },
        pageSize: list.pageSize.value,
    },
    {
        columns: baseColumns,
        allowedFilterKeys: [],
        externallyOwned: { pageSize: true, filterKeys: ['shortName'] },
    },
);
tableState.value.sort = sortToState(list.sort.value, baseColumns);

watch(
    () => tableState.value.filters.shortName,
    search => {
        if (search !== list.filters.value.search)
            list.filters.value = { ...list.filters.value, search: String(search) };
    },
);
watch(
    () => list.filters.value.search,
    search => {
        if (search !== tableState.value.filters.shortName)
            tableState.value.filters.shortName = search;
    },
);
watch(
    () => tableState.value.sort,
    s => {
        list.sort.value = sortFromState(s, baseColumns);
    },
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => {
        list.pageSize.value = size;
    },
);
watch(
    () => list.pageSize.value,
    size => {
        tableState.value.pageSize = size;
    },
);

const rows = computed(() =>
    list.items.value.map(c => {
        const readiness = activationReadiness(c);
        return {
            id: c.id,
            shortName: c.shortName,
            inn: c.inn ?? '—',
            manager: list.managerName(c.managerErpId),
            branch: list.branchName(c.branchId),
            phone: c.phone ?? '—',
            officialEmail: c.officialEmail ?? '—',
            isActive: c.isActive ? 'Yes' : 'No',
            readiness,
            readinessText: readinessText(readiness, c),
        };
    }),
);
type Row = (typeof rows.value)[number];

const chips = computed<FilterChip[]>(() =>
    ACTIVATION_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: v.key === 'all' ? undefined : READINESS_BADGE_VARIANT[v.key as Readiness],
        count: list.readinessCounts.value?.[v.key as Readiness | 'all'],
        countLoading: list.readinessCounts.value === null,
    })),
);

const router = useRouter();
const customerHref = (id: string): string => router.resolve(`/customers/${id}`).href;

const viewsKey = 'bulk-activation-select';
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
    const fields = baseColumns.map(c => c.field);
    const order = state.columnOrder.filter(f => fields.includes(f));
    tableState.value.columnOrder = [...order, ...fields.filter(f => !order.includes(f))];
    tableState.value.hiddenColumns = state.hiddenColumns.filter(
        f => fields.includes(f) && !baseColumns.find(c => c.field === f)?.required,
    );
    const field = ACTIVATION_SORT_FIELDS.find(f => f === state.sort.field);
    const sort = sortToState({ field: field ?? 'shortName', dir: state.sort.dir }, baseColumns);
    tableState.value.sort = sort;
    list.sort.value = sortFromState(sort, baseColumns);
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
        :row-height-px="52"
        :header-height-px="65"
        :search="{ filterKey: 'shortName', placeholder: 'Search company, legal name or INN…' }"
        :conditions="list.filters.value.conditions"
        :default-filters="{ shortName: '' }"
        empty-message="No counterparties match these filters"
        selectable
        :selected-ids="selectedIds"
        :selection-label="selectionLabel"
        @update:conditions="list.filters.value = { ...list.filters.value, conditions: $event }"
        @update:page="list.page.value = $event"
        @reset-page="list.page.value = 1"
        @clear-filters="list.filters.value = { ...BLANK_ACTIVATION_FILTERS }"
        @update:selected-ids="emit('update:selectedIds', $event)"
    >
        <template #empty>
            <MvErrorState
                v-if="list.failed.value"
                title="Could not load counterparties"
                message="Check the connection and try again."
                @retry="list.reload"
            />
            <template v-else>{{
                list.loading.value ? '' : 'No counterparties match your filters'
            }}</template>
        </template>

        <template #below-toolbar>
            <slot name="below-toolbar" />
        </template>

        <template #selection-actions>
            <slot name="selection-actions" />
        </template>

        <template #toolbar-start>
            <ActivationQuickFilters :list="list" />
            <MvFilterChips
                scrollable
                :chips="chips"
                :active="list.filters.value.view"
                @select="list.filters.value = { ...list.filters.value, view: $event }"
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

        <template #cell-shortName="{ data }">
            <a :href="customerHref((data as Row).id)" target="_blank" rel="noopener">{{
                (data as Row).shortName
            }}</a>
        </template>
        <template #cell-readiness="{ data }">
            <MvStatusBadge :variant="READINESS_BADGE_VARIANT[(data as Row).readiness]">
                {{ (data as Row).readinessText }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
