<script setup lang="ts">
import { computed, h, ref } from 'vue';
import type { Column } from 'element-plus';
import { MvFilterBar, MvFilterField, MvInput, MvSelect, MvStatusBadge, MvTable, MvTooltip } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { EntityVersionRow } from '../../api/history';
import type { ManagerOption } from '../../api/orders';

// Generic audit-trail widget — not Customer-specific. Any page that owns one or more
// EntityVersion-tracked objects (Counterparty+TradingPoints today, Order/OrderLine later) can
// drop this in with just `history` + `managers`. `entityLabels` lets the caller give each
// entityName a human label without this component hardcoding business entity names.
const props = withDefaults(
    defineProps<{
        history: EntityVersionRow[];
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

function fullDiffText(row: EntityVersionRow): string {
    const fields = parseChangedFields(row);
    const lines = Object.entries(fields).map(
        ([field, diff]) => `${field}: ${String(diff.from ?? '—')} → ${String(diff.to ?? '—')}`,
    );
    if (row.comment) lines.push(`Comment: ${row.comment}`);
    return lines.join('\n') || 'No field-level details';
}

// Filters
const search = ref('');
const actionFilter = ref('');
const entityFilter = ref('');
const changedByFilter = ref('');
const dateRangeFilter = ref('');

const entityTypeOptions = computed(() => {
    const names = Array.from(new Set(props.history.map(row => row.entityName)));
    return [
        { value: '', label: 'All objects' },
        ...names.map(name => ({ value: name, label: entityLabel(name) })),
    ];
});

const actionOptions = computed(() => {
    const actions = Array.from(new Set(props.history.map(row => row.action)));
    return [
        { value: '', label: 'All actions' },
        ...actions.map(action => ({ value: action, label: ACTION_LABEL[action] ?? action })),
    ];
});

const changedByOptions = computed(() => [
    { value: '', label: 'Anyone' },
    { value: 'system', label: 'System' },
    ...props.managers.map(m => ({ value: m.id, label: m.name })),
]);

function withinDateRange(row: EntityVersionRow): boolean {
    if (!dateRangeFilter.value) return true;
    const created = new Date(row.createdAt).getTime();
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    switch (dateRangeFilter.value) {
        case 'today':
            return created >= startOfToday;
        case '7d':
            return created >= now - 7 * 24 * 60 * 60 * 1000;
        case '30d':
            return created >= now - 30 * 24 * 60 * 60 * 1000;
        default:
            return true;
    }
}

const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    return props.history.filter(row => {
        if (actionFilter.value && row.action !== actionFilter.value) return false;
        if (entityFilter.value && row.entityName !== entityFilter.value) return false;
        if (changedByFilter.value === 'system' && row.administratorId) return false;
        if (
            changedByFilter.value &&
            changedByFilter.value !== 'system' &&
            row.administratorId !== changedByFilter.value
        ) {
            return false;
        }
        if (!withinDateRange(row)) return false;
        if (!term) return true;
        return (
            summary(row).toLowerCase().includes(term) ||
            (row.comment ?? '').toLowerCase().includes(term) ||
            entityLabel(row.entityName).toLowerCase().includes(term) ||
            adminName(row.administratorId).toLowerCase().includes(term)
        );
    });
});

function resetFilters(): void {
    search.value = '';
    actionFilter.value = '';
    entityFilter.value = '';
    changedByFilter.value = '';
    dateRangeFilter.value = '';
}

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
        cellRenderer: ({ rowData }) => {
            const row = rowData as unknown as TableRow & { _fullDiff: string; summary: string };
            return h(
                MvTooltip,
                {},
                {
                    default: () => h('pre', { class: 'entity-history__diff' }, row._fullDiff),
                    trigger: () => h('span', { class: 'entity-history__summary' }, row.summary),
                },
            );
        },
    },
] as Column<TableRow>[]);

const rows = computed<TableRow[]>(() =>
    filtered.value.map(row => ({
        createdAt: row.createdAt,
        action: row.action,
        entityName: entityLabel(row.entityName),
        adminName: adminName(row.administratorId),
        summary: summary(row),
        _fullDiff: fullDiffText(row),
        _key: row.id,
    })),
);
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

        <MvTable
            v-if="history.length"
            :columns="columns"
            :data="rows"
            :height="Math.min(Math.max(rows.length, 1) * 52 + 40, 520)"
            empty-text="No changes match these filters"
        />
        <p v-else class="entity-history__empty">No changes recorded yet</p>
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
</style>

<style>
.entity-history__summary {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
}

.entity-history__diff {
    margin: 0;
    font-family: inherit;
    font-size: 12px;
    white-space: pre-wrap;
}
</style>
