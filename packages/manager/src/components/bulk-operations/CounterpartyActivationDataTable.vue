<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import { activationReadiness, type ActivationCandidate } from '../../api/counterpartyPortalAccess';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';
import { mapSortToApi } from './counterpartySort';

// Issue #120 — bulk "Активация клиентов" table. Shortname is the identifying/searched column
// (manager-table-standard point 1), same role Company name plays in the reviewed concept.
//
// Row selection: MvAdvancedDataTable's own built-in `selectable`/`selectedIds`/`rowSelectable`
// (header select-all-on-page checkbox + per-row checkbox + the "N selected" bulk bar) — this
// table only ever selects the currently loaded page, same limitation already tracked
// project-wide as issue #136 ("bulk-select all rows matching the current filter, not just the
// loaded page") — not re-solved here, since #136 explicitly scopes that as its own cross-page
// investigation.
const props = defineProps<{
    items: ActivationCandidate[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    searchFilter: string;
    selectedIds: Set<string>;
    pendingActions: Map<string, 'activate' | 'deactivate'>;
    managerName: (managerErpId: string | null) => string;
    branchName: (branchId: string | null) => string;
}>();

const emit = defineEmits<{
    'update:search': [search: string];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'update:sort': [sort: CounterpartySortParameter];
    'update:selectedIds': [ids: Set<string>];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'shortName',
        header: 'Company name',
        width: 220,
        required: true,
        sortField: 'shortName',
        filterConfig: { type: 'text', placeholder: 'Company name contains…' },
        mobile: { primary: true },
    },
    { field: 'inn', header: 'INN', width: 130, sortField: 'inn', filterConfig: { type: 'none' } },
    // Sorts by the raw managerErpId column (real, server-sortable) even though the cell displays
    // a resolved name via props.managerName — sorting by the resolved display string would need
    // a client-side sort instead, not worth it for a column that's secondary to shortName/inn.
    { field: 'manager', header: 'Manager', width: 160, sortField: 'managerErpId', filterConfig: { type: 'none' } },
    { field: 'branch', header: 'Branch', width: 140, filterConfig: { type: 'none' } },
    { field: 'phone', header: 'Phone', width: 150, sortField: 'phone', filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'officialEmail', header: 'Official email', width: 200, sortField: 'officialEmail', filterConfig: { type: 'none' } },
    {
        field: 'readiness',
        header: 'Portal access',
        width: 180,
        filterConfig: { type: 'none' },
        mobile: { badge: true },
    },
];

interface FilterState {
    [key: string]: unknown;
    shortName: string;
}
const BLANK_FILTERS: FilterState = { shortName: '' };

const { state: tableState } = useDataTableState<FilterState>(
    'bulk-operations-counterparty-activation-datatable',
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        // Mirrors the backend's own default (CounterpartyService.baseVisibleQb's shortName ASC)
        // so the sort button UI reflects reality on first load, not "no sort active".
        sort: [{ field: 'shortName', order: 1 }],
        filters: { shortName: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ['shortName'],
        externallyOwned: { pageSize: true, filterKeys: ['shortName'] },
    },
);

watch(() => tableState.value.filters, f => emit('update:search', f.shortName), { deep: true });
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

// See counterpartySort.ts's mapSortToApi for the mapping logic + the real bug it guards against.
watch(
    () => tableState.value.sort,
    meta => emit('update:sort', mapSortToApi(meta, ALL_COLUMNS)),
    { deep: true },
);
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, shortName: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface Row {
    [key: string]: unknown;
    id: string;
    shortName: string;
    inn: string;
    manager: string;
    branch: string;
    phone: string;
    officialEmail: string;
    readiness: ReturnType<typeof activationReadiness>;
    disabledReason: string | null;
}

const rows = computed<Row[]>(() =>
    props.items.map(c => {
        const readiness = activationReadiness(c);
        const disabledReason =
            readiness === 'erp-inactive'
                ? 'ERP inactive: activation not allowed'
                : readiness === 'missing-data'
                  ? 'Missing phone/official email — fill it in on the Counterparty page'
                  : readiness === 'activated'
                    ? 'Already activated'
                    : null;
        return {
            id: c.id,
            shortName: c.shortName,
            inn: c.inn ?? '—',
            manager: props.managerName(c.managerErpId),
            branch: props.branchName(c.branchId),
            phone: c.phone ?? '—',
            officialEmail: c.officialEmail ?? '—',
            readiness,
            disabledReason,
        };
    }),
);

function canSelect(row: Row): boolean {
    return row.readiness === 'ready' || row.readiness === 'activated';
}

const READINESS_LABEL: Record<Row['readiness'], string> = {
    ready: 'Ready to activate',
    'missing-data': 'Missing data',
    'erp-inactive': 'ERP inactive',
    activated: 'Activated',
};
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="52"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'shortName', placeholder: 'Search company name…' }"
        empty-message="No counterparties match these filters"
        selectable
        :selected-ids="selectedIds"
        :row-selectable="canSelect"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
        @update:selected-ids="emit('update:selectedIds', $event)"
    >
        <template #selection-actions="slotProps">
            <slot name="selection-actions" v-bind="slotProps" />
        </template>

        <template #cell-readiness="{ data }">
            <template v-if="pendingActions.has((data as Row).id)">
                <MvStatusBadge variant="warning">
                    {{ pendingActions.get((data as Row).id) === 'activate' ? 'Activate on Save' : 'Deactivate on Save' }}
                </MvStatusBadge>
            </template>
            <template v-else-if="(data as Row).readiness === 'missing-data'">
                <router-link class="counterparty-activation__missing-link" :to="`/customers/${(data as Row).id}`">
                    Missing data → Open Counterparty
                </router-link>
            </template>
            <MvStatusBadge
                v-else
                :variant="
                    (data as Row).readiness === 'activated'
                        ? 'neutral'
                        : (data as Row).readiness === 'erp-inactive'
                          ? 'danger'
                          : 'success'
                "
            >
                {{ READINESS_LABEL[(data as Row).readiness] }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.counterparty-activation__missing-link {
    color: var(--el-color-primary, #0f766e);
    font-weight: 600;
    text-decoration: none;
}

.counterparty-activation__missing-link:hover {
    text-decoration: underline;
}
</style>
