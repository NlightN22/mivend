<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import type { Column } from 'element-plus';
import { MvFilterBar, MvFilterField, MvInput, MvModal, MvPagination, MvSelect, MvStatusBadge, MvTable } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import { fetchEntityVersionsForRefs, type EntityRef, type EntityVersionRow } from '../../api/history';
import type { ManagerOption } from '../../api/orders';

// Generic audit-trail widget — not Customer-specific. Any page that owns one or more
// EntityVersion-tracked objects (Counterparty+TradingPoints today, Order/OrderLine later) can
// drop this in with `refs` + `managers`. `entityLabels` lets the caller give each entityName a
// human label without this component hardcoding business entity names.
//
// Server-side paginated + filtered (issue #39) — action/object-type/changed-by/date-range are
// real EntityVersion columns, pushed into the `entityVersionsForEntities` query directly. This
// was the actual root cause of the "History-tab virtualization e2e flakiness" note: an unbounded
// client-side-filtered fetch grew forever over a long dev session. `search` is the one exception
// — it matches the JS-derived changed-fields summary/comment/joined display names, which aren't
// SQL columns, so it only filters within the currently-loaded page (same documented limitation
// as Approvals' search).
const props = withDefaults(
    defineProps<{
        refs: EntityRef[];
        managers: ManagerOption[];
        entityLabels?: Record<string, string>;
    }>(),
    { entityLabels: () => ({}) },
);

const PAGE_SIZE = 20;

const ACTION_LABEL: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    deactivate: 'Deactivated',
    reactivate: 'Reactivated',
};

const ACTION_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
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

// Filters — all except `search` trigger a server refetch (see load()).
const search = ref('');
const actionFilter = ref('');
const entityFilter = ref('');
const changedByFilter = ref('');
const dateRangeFilter = ref('');
const page = ref(1);

// Known upfront from `refs` — doesn't need loaded data, unlike the old fully-client-side version.
const entityTypeOptions = computed(() => {
    const names = Array.from(new Set(props.refs.map(ref => ref.entityName)));
    return [
        { value: '', label: 'All objects' },
        ...names.map(name => ({ value: name, label: entityLabel(name) })),
    ];
});

const actionOptions = [
    { value: '', label: 'All actions' },
    ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })),
];

const changedByOptions = computed(() => [
    { value: '', label: 'Anyone' },
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

function resetFilters(): void {
    search.value = '';
    actionFilter.value = '';
    entityFilter.value = '';
    changedByFilter.value = '';
    dateRangeFilter.value = '';
    page.value = 1;
}

const rawRows = ref<EntityVersionRow[]>([]);
const totalItems = ref(0);
const loading = ref(true);

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchEntityVersionsForRefs(props.refs, {
            take: PAGE_SIZE,
            skip: (page.value - 1) * PAGE_SIZE,
            action: actionFilter.value || undefined,
            entityName: entityFilter.value || undefined,
            system: changedByFilter.value === 'system' ? true : undefined,
            administratorId:
                changedByFilter.value && changedByFilter.value !== 'system'
                    ? changedByFilter.value
                    : undefined,
            createdAfter: dateRangeToCreatedAfter(dateRangeFilter.value),
        });
        rawRows.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

watch([actionFilter, entityFilter, changedByFilter, dateRangeFilter], () => {
    page.value = 1;
    void load();
});
watch(page, () => void load());
watch(() => props.refs, () => {
    page.value = 1;
    void load();
});

onMounted(load);

// `search` only narrows the already-loaded page — see the component-level comment above.
const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return rawRows.value;
    return rawRows.value.filter(row =>
        summary(row).toLowerCase().includes(term) ||
        (row.comment ?? '').toLowerCase().includes(term) ||
        entityLabel(row.entityName).toLowerCase().includes(term) ||
        adminName(row.administratorId).toLowerCase().includes(term),
    );
});

const columns = computed<Column<TableRow>[]>(() => [
    {
        key: 'createdAt',
        title: 'When',
        dataKey: 'createdAt',
        width: 170,
        cellRenderer: ({ cellData }) => new Date(cellData as unknown as string).toLocaleString('en-US'),
    },
    {
        key: 'action',
        title: 'Action',
        dataKey: 'action',
        width: 130,
        cellRenderer: ({ cellData }) => {
            const action = cellData as unknown as string;
            return h(MvStatusBadge, { variant: ACTION_VARIANT[action] ?? 'neutral' }, () => ACTION_LABEL[action] ?? action);
        },
    },
    { key: 'entityName', title: 'Object', dataKey: 'entityName', width: 140 },
    { key: 'adminName', title: 'Changed by', dataKey: 'adminName', width: 160 },
    {
        key: 'summary',
        title: 'Changes',
        dataKey: 'summary',
        flexGrow: 1,
        cellRenderer: ({ cellData }) =>
            h('span', { class: 'entity-history__summary' }, cellData as unknown as string),
    },
] as Column<TableRow>[]);

const rows = computed<TableRow[]>(() =>
    filtered.value.map(row => ({
        createdAt: row.createdAt,
        action: row.action,
        entityName: entityLabel(row.entityName),
        adminName: adminName(row.administratorId),
        summary: summary(row),
        _key: row.id,
    })),
);

function handleRowClick({ rowData }: { rowData: TableRow }): void {
    selectedRow.value = rawRows.value.find(row => row.id === rowData._key) ?? null;
}
</script>

<template>
    <div class="entity-history">
        <MvFilterBar @reset="resetFilters">
            <MvFilterField label="Search">
                <MvInput size="sm" :model-value="search" placeholder="Field, comment, changed by..." @update:model-value="search = $event" />
            </MvFilterField>
            <MvFilterField label="Action">
                <MvSelect :model-value="actionFilter" :options="actionOptions" @update:model-value="actionFilter = $event" />
            </MvFilterField>
            <MvFilterField v-if="entityTypeOptions.length > 2" label="Object type">
                <MvSelect :model-value="entityFilter" :options="entityTypeOptions" @update:model-value="entityFilter = $event" />
            </MvFilterField>
            <MvFilterField label="Changed by">
                <MvSelect :model-value="changedByFilter" :options="changedByOptions" @update:model-value="changedByFilter = $event" />
            </MvFilterField>
            <MvFilterField label="Date range">
                <MvSelect :model-value="dateRangeFilter" :options="[...DATE_RANGE_OPTIONS]" @update:model-value="dateRangeFilter = $event" />
            </MvFilterField>
        </MvFilterBar>

        <div v-if="rawRows.length" class="entity-history__table">
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            <MvTable
                :columns="columns"
                :data="rows"
                :height="Math.min(Math.max(rows.length, PAGE_SIZE) * 52 + 40, 520)"
                empty-text="No changes match these filters"
                @row-click="handleRowClick"
            />
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
        </div>
        <p v-else-if="!loading" class="entity-history__empty">No changes recorded yet</p>

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

.entity-history__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    padding: 10px 0;
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

<style>
.entity-history__summary {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* The whole row opens the detail modal on click (see handleRowClick) — the pointer cursor is
   the discoverability cue, replacing the old hover-only tooltip. Scoped to this widget's own
   wrapper (not .mv-table generally) so other MvTable usages elsewhere are unaffected. */
.entity-history__table .el-table-v2__row {
    cursor: pointer;
}
</style>
