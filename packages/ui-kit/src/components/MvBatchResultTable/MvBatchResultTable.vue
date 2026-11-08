<script setup lang="ts">
import { computed } from 'vue';
import MvPagination from '../MvPagination/MvPagination.vue';
import MvStatusBadge from '../MvStatusBadge/MvStatusBadge.vue';
import {
    pendingCount,
    rowDetail,
    rowStatus,
    type BatchCounters,
    type BatchResultMode,
    type BatchResultRow,
} from './batchResultModel';

// Per-record outcome of a batch, with counters; the same table serves the review and the result.
const props = withDefaults(
    defineProps<{
        rows: BatchResultRow[];
        counters: BatchCounters;
        mode?: BatchResultMode;
        page?: number;
        pageSize?: number;
        totalRows?: number;
        activeOutcome?: string;
        recordLabel?: string;
        emptyMessage?: string;
        loading?: boolean;
        reasonLabel?: (code: string) => string;
    }>(),
    {
        mode: 'result',
        page: 1,
        pageSize: 25,
        totalRows: undefined,
        activeOutcome: '',
        recordLabel: 'Record',
        emptyMessage: 'No records',
        loading: false,
        reasonLabel: undefined,
    },
);
const emit = defineEmits<{
    'update:page': [page: number];
    'update:activeOutcome': [outcome: string];
}>();

const stats = computed(() => {
    const result = props.mode === 'result';
    return [
        { key: '', label: 'All', count: props.counters.total, variant: 'neutral' as const },
        {
            key: result ? 'applied' : 'apply',
            label: result ? 'Applied' : 'Will apply',
            count: props.counters.applied,
            variant: 'success' as const,
        },
        {
            key: result ? 'skipped' : 'skip',
            label: 'Skipped',
            count: props.counters.skipped,
            variant: 'warning' as const,
        },
        ...(result
            ? [
                  {
                      key: 'failed',
                      label: 'Failed',
                      count: props.counters.failed,
                      variant: 'danger' as const,
                  },
              ]
            : []),
        ...(result && pendingCount(props.counters) > 0
            ? [
                  {
                      key: 'pending',
                      label: 'Pending',
                      count: pendingCount(props.counters),
                      variant: 'neutral' as const,
                  },
              ]
            : []),
    ];
});
const total = computed(() => props.totalRows ?? props.rows.length);
</script>

<template>
    <div class="mv-batch-result" :aria-busy="loading">
        <div class="mv-batch-result__stats" role="group" aria-label="Counters">
            <button
                v-for="stat in stats"
                :key="stat.key"
                type="button"
                class="mv-batch-result__stat"
                :class="{ 'mv-batch-result__stat--active': activeOutcome === stat.key }"
                @click="emit('update:activeOutcome', stat.key)"
            >
                <MvStatusBadge :variant="stat.variant">{{ stat.count }}</MvStatusBadge>
                <span>{{ stat.label }}</span>
            </button>
        </div>

        <p v-if="!rows.length" class="mv-batch-result__empty">{{ loading ? '' : emptyMessage }}</p>
        <table v-else class="mv-batch-result__table">
            <thead>
                <tr>
                    <th>{{ recordLabel }}</th>
                    <th>Result</th>
                    <th>Reason</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.targetId">
                    <td data-label="Record">
                        <span class="mv-batch-result__name">{{ row.label ?? row.targetId }}</span>
                        <span v-if="row.label" class="mv-batch-result__id"
                            >#{{ row.targetId }}</span
                        >
                    </td>
                    <td data-label="Result">
                        <MvStatusBadge :variant="rowStatus(row, mode).variant">{{
                            rowStatus(row, mode).text
                        }}</MvStatusBadge>
                    </td>
                    <td data-label="Reason" class="mv-batch-result__reason">
                        {{ rowDetail(row, reasonLabel) }}
                    </td>
                </tr>
            </tbody>
        </table>

        <MvPagination
            v-if="total > pageSize"
            :page="page"
            :page-size="pageSize"
            :total="total"
            @update:page="emit('update:page', $event)"
        />
    </div>
</template>

<style scoped>
.mv-batch-result {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.mv-batch-result__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mv-batch-result__stat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
}

.mv-batch-result__stat--active {
    border-color: var(--el-color-primary);
}

.mv-batch-result__empty {
    margin: 0;
    padding: 24px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}

.mv-batch-result__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.mv-batch-result__table th {
    padding: 8px 12px;
    text-align: left;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    border-bottom: 1px solid var(--el-border-color);
}

.mv-batch-result__table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--el-border-color);
    vertical-align: top;
}

.mv-batch-result__name {
    font-weight: 600;
}

.mv-batch-result__id {
    margin-left: 6px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.mv-batch-result__reason {
    color: var(--el-text-color-secondary);
}

@media (max-width: 800px) {
    .mv-batch-result__table thead {
        display: none;
    }

    .mv-batch-result__table,
    .mv-batch-result__table tbody,
    .mv-batch-result__table tr,
    .mv-batch-result__table td {
        display: block;
    }

    .mv-batch-result__table tr {
        padding: 10px 0;
        border-bottom: 1px solid var(--el-border-color);
    }

    .mv-batch-result__table td {
        padding: 2px 0;
        border: 0;
    }
}
</style>
