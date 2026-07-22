<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvModal,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import { fetchEntityVersionsForRefs, type EntityRef, type EntityVersionRow } from '../../api/history';
import type { ManagerOption } from '../../api/orders';

// Generic audit-trail widget — not Customer-specific. Any page that owns one or more
// EntityVersion-tracked objects (Counterparty+TradingPoints today, Order/OrderLine later) can
// drop this in with `refs` + `managers`. `entityLabels` lets the caller give each entityName a
// human label without this component hardcoding business entity names.
//
// Seventh consumer of @mivend/ui-kit's MvAdvancedDataTable — see manager-table-standard skill.
// An audit log has no natural "number" the way an order/invoice/discount does; `summary`
// ("Changes") is the closest thing to an identifying column (what a reviewer scans first when
// hunting for who changed what) and gets the required/search slot instead. Action/Object
// type/Changed by/Date range are real EntityVersion columns pushed into
// `entityVersionsForEntities` server-side (issue #39) — the one deliberate exception is the
// toolbar search itself: it matches the JS-derived changed-fields summary/comment/joined display
// names, which aren't SQL columns, so it only filters within the currently-loaded page (same
// documented limitation as Approvals' search) and must NOT trigger a refetch/page reset the way
// the other filters do.
const props = withDefaults(
    defineProps<{
        refs: EntityRef[];
        managers: ManagerOption[];
        entityLabels?: Record<string, string>;
    }>(),
    { entityLabels: () => ({}) },
);

const ACTION_LABEL: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    deactivate: 'Deactivated',
    reactivate: 'Reactivated',
};

const ACTION_BADGE_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
    create: 'success',
    update: 'info',
    deactivate: 'danger',
    reactivate: 'success',
};

const DATE_RANGE_OPTIONS = [
    { value: '', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
] as const;

function entityLabel(entityName: string): string {
    return props.entityLabels[entityName] ?? entityName;
}

function adminName(id: string | null): string {
    if (!id) return 'System';
    return props.managers.find(m => m.id === id)?.name ?? 'Unknown';
}

function parseChangedFields(row: EntityVersionRow): Record<string, { from: unknown; to: unknown }> {
    if (!row.changedFields) return {};
    try {
        return JSON.parse(row.changedFields) as Record<string, { from: unknown; to: unknown }>;
    } catch {
        return {};
    }
}

function summary(row: EntityVersionRow): string {
    const fields = Object.keys(parseChangedFields(row));
    return fields.length ? fields.join(', ') : '—';
}

// Contacts are logged as full { name, phone, email, isPrimary } snapshots (see
// TradingPointService.updateDetails) — render them readably instead of dumping raw JSON, so a
// reviewer can actually spot "who typed the wrong phone number" from the modal below.
function formatDiffValue(field: string, value: unknown): string {
    if (field === 'contacts' && Array.isArray(value)) {
        if (value.length === 0) return '(none)';
        return value
            .map((c: { name?: string; phone?: string | null }) =>
                c.phone ? `${c.name} (${c.phone})` : String(c.name),
            )
            .join('; ');
    }
    if (value === null || value === undefined || value === '') return '(empty)';
    return String(value);
}

interface DiffLine {
    field: string;
    from: string;
    to: string;
}

function diffLines(row: EntityVersionRow): DiffLine[] {
    const fields = parseChangedFields(row);
    return Object.entries(fields).map(([field, diff]) => ({
        field,
        from: formatDiffValue(field, diff.from),
        to: formatDiffValue(field, diff.to),
    }));
}

// Row selected for the detail modal — clicking a row (not just hovering) is what makes the
// diff usable for scanning many entries in a row when hunting for who broke what.
const selectedRow = ref<EntityVersionRow | null>(null);

const page = ref(1);

// Known upfront from `refs` — doesn't need loaded data, unlike the old fully-client-side version.
const entityTypeOptions = computed(() => {
    const names = Array.from(new Set(props.refs.map(r => r.entityName)));
    return names.map(name => ({ value: name, label: entityLabel(name) }));
});

const actionOptions = Object.entries(ACTION_LABEL).map(([value, label]) => ({
    value,
    label,
    variant: ACTION_BADGE_VARIANT[value],
}));

const changedByOptions = computed(() => [
    { value: 'system', label: 'System' },
    ...props.managers.map(m => ({ value: m.id, label: m.name })),
]);

function dateRangeToCreatedAfter(range: string): string | undefined {
    const now = new Date();
    switch (range) {
        case 'today':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        default:
            return undefined;
    }
}

interface HistoryFilterState {
    [key: string]: unknown;
    summary: string;
    createdAt: string;
    action: string;
    entityName: string;
    adminName: string;
}
const BLANK_FILTERS: HistoryFilterState = {
    summary: '',
    createdAt: '',
    action: '',
    entityName: '',
    adminName: '',
};

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'summary',
        header: 'Changes',
        width: 260,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Field, comment, changed by…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'When', width: 170, filterConfig: { type: 'select', placeholder: 'All time', options: [...DATE_RANGE_OPTIONS] } },
    {
        field: 'action',
        header: 'Action',
        width: 130,
        filterConfig: { type: 'status', placeholder: 'All actions', options: actionOptions },
        mobile: { badge: true },
    },
    // Only meaningful when this widget's refs actually span more than one entity type (e.g. a
    // Counterparty plus its TradingPoints) — a single-type ref set has nothing to filter, so the
    // column stays visible for layout consistency but its filter is disabled rather than shown
    // with exactly one option. Real options spliced in by resolvedColumns below, once refs/
    // managers are known — same shape as CustomerDocumentsDataTable.vue's Type column.
    { field: 'entityName', header: 'Object', width: 140, filterConfig: { type: 'none' } },
    { field: 'adminName', header: 'Changed by', width: 160, filterConfig: { type: 'select', placeholder: 'Anyone', options: [] } },
];

const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.map(col => {
        if (col.field === 'entityName') {
            return entityTypeOptions.value.length > 1
                ? { ...col, filterConfig: { type: 'select' as const, placeholder: 'All objects', options: entityTypeOptions.value } }
                : col;
        }
        if (col.field === 'adminName' && col.filterConfig.type === 'select') {
            return { ...col, filterConfig: { ...col.filterConfig, options: changedByOptions.value } };
        }
        return col;
    }),
);

const { state: tableState } = useDataTableState<HistoryFilterState>(
    'entity-history-datatable',
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: BLANK_FILTERS,
        pageSize: 20,
    },
    {
        columns: ALL_COLUMNS,
        // `entityName`'s filterConfig is 'none' in the static ALL_COLUMNS above (its real filter
        // is spliced in reactively by resolvedColumns once refs are known) — included explicitly
        // here so a saved filter value for it survives normalization regardless.
        allowedFilterKeys: [
            ...ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
            'entityName',
        ],
    },
);

const rawRows = ref<EntityVersionRow[]>([]);
const totalItems = ref(0);
const loading = ref(true);

async function load(): Promise<void> {
    loading.value = true;
    try {
        const f = tableState.value.filters;
        const result = await fetchEntityVersionsForRefs(props.refs, {
            take: tableState.value.pageSize,
            skip: (page.value - 1) * tableState.value.pageSize,
            action: (f.action as string) || undefined,
            entityName: (f.entityName as string) || undefined,
            system: f.adminName === 'system' ? true : undefined,
            administratorId: f.adminName && f.adminName !== 'system' ? (f.adminName as string) : undefined,
            createdAfter: dateRangeToCreatedAfter(f.createdAt as string),
        });
        rawRows.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

// `summary` (the toolbar search) only narrows the already-loaded page (see this component's own
// doc comment above) — deliberately excluded from this watcher so typing a search term doesn't
// reset the page or trigger a refetch, unlike every real server-side filter.
watch(
    () => [
        tableState.value.filters.createdAt,
        tableState.value.filters.action,
        tableState.value.filters.entityName,
        tableState.value.filters.adminName,
        tableState.value.pageSize,
    ],
    () => {
        page.value = 1;
        void load();
    },
);
watch(page, () => void load());
watch(
    () => props.refs,
    () => {
        page.value = 1;
        void load();
    },
);

onMounted(load);

interface HistoryRow {
    [key: string]: unknown;
    id: string;
    createdAt: string;
    action: string;
    entityName: string;
    adminName: string;
    summary: string;
}

// Local-only narrowing against the currently-loaded page — see this component's doc comment.
const filteredRows = computed<HistoryRow[]>(() => {
    const term = (tableState.value.filters.summary as string).trim().toLowerCase();
    const mapped = rawRows.value.map(row => ({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        entityName: entityLabel(row.entityName),
        adminName: adminName(row.administratorId),
        summary: summary(row),
    }));
    if (!term) return mapped;
    return mapped.filter(row =>
        row.summary.toLowerCase().includes(term) ||
        row.entityName.toLowerCase().includes(term) ||
        row.adminName.toLowerCase().includes(term) ||
        (rawRows.value.find(r => r.id === row.id)?.comment ?? '').toLowerCase().includes(term),
    );
});

function onRowClick(event: AdvancedDataTableRowClickPayload<HistoryRow>): void {
    selectedRow.value = rawRows.value.find(row => row.id === event.row.id) ?? null;
}
</script>

<template>
    <div class="entity-history">
        <MvAdvancedDataTable
            v-model:table-state="tableState"
            :columns="resolvedColumns"
            :rows="filteredRows"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            data-key="id"
            :row-height-px="49"
            :header-height-px="65"
            :default-filters="BLANK_FILTERS"
            :search="{ filterKey: 'summary', placeholder: 'Field, comment, changed by…' }"
            empty-message="No changes recorded yet"
            @update:page="p => (page = p)"
            @reset-page="page = 1"
            @row-click="onRowClick"
        >
            <template #cell-createdAt="{ data }">
                <MvDateTimeCell :value="(data as HistoryRow).createdAt" />
            </template>
            <template #cell-action="{ data }">
                <MvStatusBadge :variant="ACTION_BADGE_VARIANT[(data as HistoryRow).action] ?? 'neutral'">
                    {{ ACTION_LABEL[(data as HistoryRow).action] ?? (data as HistoryRow).action }}
                </MvStatusBadge>
            </template>
        </MvAdvancedDataTable>

        <MvModal v-if="selectedRow" title="Change details" @close="selectedRow = null">
            <div class="entity-history__detail">
                <dl class="entity-history__detail-meta">
                    <dt>When</dt>
                    <dd>{{ new Date(selectedRow.createdAt).toLocaleString('en-US') }}</dd>
                    <dt>Action</dt>
                    <dd>{{ ACTION_LABEL[selectedRow.action] ?? selectedRow.action }}</dd>
                    <dt>Object</dt>
                    <dd>{{ entityLabel(selectedRow.entityName) }}</dd>
                    <dt>Changed by</dt>
                    <dd>{{ adminName(selectedRow.administratorId) }}</dd>
                </dl>

                <table v-if="diffLines(selectedRow).length" class="entity-history__diff-table">
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>From</th>
                            <th>To</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="line in diffLines(selectedRow)" :key="line.field">
                            <td>{{ line.field }}</td>
                            <td>{{ line.from }}</td>
                            <td>{{ line.to }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="entity-history__no-diff">No field-level details for this entry.</p>

                <p v-if="selectedRow.comment" class="entity-history__comment">
                    Comment: {{ selectedRow.comment }}
                </p>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.entity-history {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.entity-history__detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.entity-history__detail-meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
}

.entity-history__detail-meta dt {
    color: var(--el-text-color-secondary, #6b7280);
    font-weight: 700;
}

.entity-history__detail-meta dd {
    margin: 0;
}

.entity-history__diff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.entity-history__diff-table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--el-text-color-secondary, #6b7280);
    padding: 6px 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.entity-history__diff-table td {
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    vertical-align: top;
}

.entity-history__no-diff,
.entity-history__comment {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
