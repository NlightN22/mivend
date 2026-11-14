<script setup lang="ts">
import { computed } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';

const props = withDefaults(
    defineProps<{
        page: number;
        pageSize: number;
        total: number;
        previousLabel?: string;
        nextLabel?: string;
        summaryLabel?: (start: number, end: number, total: number) => string;
        pageLabel?: (page: number, pageCount: number) => string;
    }>(),
    {
        previousLabel: undefined,
        nextLabel: undefined,
        summaryLabel: undefined,
        pageLabel: undefined,
    },
);
const emit = defineEmits<{ 'update:page': [page: number] }>();
const label = useUiLabels();
const previousText = computed(() => props.previousLabel ?? label('previous', 'Previous'));
const nextText = computed(() => props.nextLabel ?? label('next', 'Next'));

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.total));

const summary = computed(() =>
    props.summaryLabel
        ? props.summaryLabel(rangeStart.value, rangeEnd.value, props.total)
        : label('paginationSummary', '{start}–{end} of {total}')
              .replace('{start}', () => String(rangeStart.value))
              .replace('{end}', () => String(rangeEnd.value))
              .replace('{total}', () => String(props.total)),
);
const pageText = computed(() =>
    props.pageLabel
        ? props.pageLabel(props.page, pageCount.value)
        : label('paginationPage', 'Page {page} of {pageCount}')
              .replace('{page}', () => String(props.page))
              .replace('{pageCount}', () => String(pageCount.value)),
);

// Blur before the button turns disabled, or Chrome moves focus to <body> and scrolls to the top.
function goTo(target: number, event: MouseEvent): void {
    (event.currentTarget as HTMLButtonElement).blur();
    emit('update:page', target);
}
</script>

<template>
    <div class="mv-pagination">
        <span class="mv-pagination__summary">
            {{ summary }}
        </span>
        <div class="mv-pagination__controls">
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page <= 1"
                @click="goTo(page - 1, $event)"
            >
                {{ previousText }}
            </button>
            <span class="mv-pagination__page">{{ pageText }}</span>
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page >= pageCount"
                @click="goTo(page + 1, $event)"
            >
                {{ nextText }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.mv-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.mv-pagination__controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.mv-pagination__btn {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font-size: 13px;
    cursor: pointer;
}

.mv-pagination__btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.mv-pagination__btn:not(:disabled):hover {
    background: var(--el-fill-color-light);
}
</style>
