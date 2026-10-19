<script setup lang="ts">
import { computed } from 'vue';

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
        previousLabel: 'Previous',
        nextLabel: 'Next',
        summaryLabel: (start: number, end: number, total: number) => `${start}–${end} of ${total}`,
        pageLabel: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
    },
);
const emit = defineEmits<{ 'update:page': [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.total));

// Blur before the button turns disabled, or Chrome moves focus to <body> and scrolls to the top.
function goTo(target: number, event: MouseEvent): void {
    (event.currentTarget as HTMLButtonElement).blur();
    emit('update:page', target);
}
</script>

<template>
    <div class="mv-pagination">
        <span class="mv-pagination__summary">
            {{ summaryLabel(rangeStart, rangeEnd, total) }}
        </span>
        <div class="mv-pagination__controls">
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page <= 1"
                @click="goTo(page - 1, $event)"
            >
                {{ previousLabel }}
            </button>
            <span class="mv-pagination__page">{{ pageLabel(page, pageCount) }}</span>
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page >= pageCount"
                @click="goTo(page + 1, $event)"
            >
                {{ nextLabel }}
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
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-pagination__controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.mv-pagination__btn {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: #fff;
    color: var(--el-text-color-primary, #17212b);
    font-size: 13px;
    cursor: pointer;
}

.mv-pagination__btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.mv-pagination__btn:not(:disabled):hover {
    background: var(--el-fill-color-light, #f8fafc);
}
</style>
