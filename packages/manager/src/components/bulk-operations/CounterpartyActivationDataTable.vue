<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvSelect,
    MvStatusBadge,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import { activationReadiness, type ActivationCandidate } from '../../api/counterpartyPortalAccess';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';
import type { BranchOption } from '../../api/orders';
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
    managerFilter: string;
    branchFilter: string;
    statusFilter: 'active' | 'inactive' | '';
    branchOptions: BranchOption[];
    selectedIds: Set<string>;
    pendingActions: Map<string, 'activate' | 'deactivate'>;
    managerName: (managerErpId: string | null) => string;
    branchName: (branchId: string | null) => string;
}>();

const emit = defineEmits<{
    'update:search': [search: string];
    'update:manager-filter': [value: string];
    'update:branch-filter': [value: string];
    'update:status-filter': [value: 'active' | 'inactive' | ''];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'update:sort': [sort: CounterpartySortParameter];
    'update:selectedIds': [ids: Set<string>];
}>();

// Real backend support already exists for all three (CounterpartyListOptions.managerErpId/
// branchId/status) but had no UI at all before this — the manager portal's own version of the
// Vendure Dashboard's Counterparty list filters (ERP Manager text filter, Status facetedFilter).
// Reactive (not a plain const) since the Branch column's select options depend on
// `branchOptions`, fetched async by the owning page.
const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'shortName',
        header: 'Company name',
        width: 220,
        // Real incident this guards: a real ERP legal name ("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ
        // ГЛАВА КРЕСТЬЯНСКОГО...") is far longer than any reasonable column width — without a
        // maxWidth, MvAdvancedDataTable's table-layout:fixed still respects a resized width, so
        // an unbounded manual resize could re-create the same "one column pushes every other one
        // off-screen" problem this was fixed for at the base-component level.
        minWidth: 160,
        maxWidth: 340,
        required: true,
        sortField: 'shortName',
        filterConfig: { type: 'text', placeholder: 'Company name contains…' },
        mobile: { primary: true },
    },
    { field: 'inn', header: 'INN', width: 130, sortField: 'inn', filterConfig: { type: 'none' } },
    // Sorts by the raw managerErpId column (real, server-sortable) even though the cell displays
    // a resolved name via props.managerName — sorting by the resolved display string would need
    // a client-side sort instead, not worth it for a column that's secondary to shortName/inn.
    // The filter is real too, backed by CounterpartyListOptions.managerErpId (ILIKE against the
    // raw erpId or the ERP-reported administrator name, see counterparty.service.ts) — text, not
    // select, since there's no small bounded list of ERP managers to pick from.
    {
        field: 'manager',
        header: 'Manager',
        width: 160,
        sortField: 'managerErpId',
        filterConfig: { type: 'text', placeholder: 'Manager contains…' },
    },
    // Real backend filter (CounterpartyListOptions.branchId) — select, using Branch.id (see
    // BranchOption's own doc comment for why this must be `id`, never `erpId`; issue #139 tracked
    // resolving that ambiguity, now confirmed: Branch is a purely mivend-internal entity, the ERP
    // has no "branch" concept at all).
    {
        field: 'branch',
        header: 'Branch',
        width: 140,
        filterConfig: {
            type: 'select',
            placeholder: 'Any branch',
            options: props.branchOptions.map(b => ({ value: b.id, label: b.name })),
        },
    },
    { field: 'phone', header: 'Phone', width: 150, sortField: 'phone', filterConfig: { type: 'none' }, mobile: { hidden: true } },
    { field: 'officialEmail', header: 'Official email', width: 200, sortField: 'officialEmail', filterConfig: { type: 'none' } },
    {
        field: 'readiness',
        header: 'Portal access',
        width: 200,
        filterConfig: { type: 'none' },
        mobile: { badge: true },
    },
]);

interface FilterState {
    [key: string]: unknown;
    shortName: string;
    manager: string;
    branch: string;
}
const BLANK_FILTERS: FilterState = { shortName: '', manager: '', branch: '' };

const { state: tableState } = useDataTableState<FilterState>(
    'bulk-operations-counterparty-activation-datatable',
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        // Mirrors the backend's own default (CounterpartyService.baseVisibleQb's shortName ASC)
        // so the sort button UI reflects reality on first load, not "no sort active".
        sort: [{ field: 'shortName', order: 1 }],
        filters: { shortName: props.searchFilter, manager: props.managerFilter, branch: props.branchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ['shortName', 'manager', 'branch'],
        externallyOwned: { pageSize: true, filterKeys: ['shortName', 'manager', 'branch'] },
    },
);

watch(() => tableState.value.filters, f => emit('update:search', f.shortName), { deep: true });
watch(() => tableState.value.filters, f => emit('update:manager-filter', f.manager), { deep: true });
watch(() => tableState.value.filters, f => emit('update:branch-filter', f.branch), { deep: true });
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

// See counterpartySort.ts's mapSortToApi for the mapping logic + the real bug it guards against.
watch(
    () => tableState.value.sort,
    meta => emit('update:sort', mapSortToApi(meta, ALL_COLUMNS.value)),
    { deep: true },
);
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, shortName: v };
});
watch(() => props.managerFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, manager: v };
});
watch(() => props.branchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, branch: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

const STATUS_OPTIONS = [
    { value: '', label: 'Any status' },
    { value: 'active', label: 'Active (ERP)' },
    { value: 'inactive', label: 'Inactive (ERP)' },
];

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
        // "on the Counterparty page" used to promise a fix that doesn't exist there — phone/
        // officialEmail aren't shown or editable anywhere in the manager portal (they're
        // ERP-sourced and read-only, see counterpartyPortalAccess.ts's own doc comment); the
        // only real fix is upstream, in the ERP integration itself. Never imply a destination
        // page can resolve this.
        const disabledReason =
            readiness === 'erp-inactive'
                ? 'ERP inactive: activation not allowed'
                : readiness === 'missing-data'
                  ? 'Missing phone/official email — sourced from the ERP integration, not editable here'
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
        <template #toolbar-start>
            <MvSelect
                :model-value="statusFilter"
                :options="STATUS_OPTIONS"
                @update:model-value="emit('update:status-filter', $event as 'active' | 'inactive' | '')"
            />
        </template>

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
                <MvStatusBadge variant="warning" title="Sourced from the ERP integration — not editable in the manager portal">
                    Missing data (ERP)
                </MvStatusBadge>
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
