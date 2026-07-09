<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; pageSize: number; total: number }>();
const emit = defineEmits<{ 'update:page': [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.total));
</script>

<template>
    <div class="mv-pagination">
        <span class="mv-pagination__summary">
            {{ rangeStart }}–{{ rangeEnd }} of {{ total }}
        </span>
        <div class="mv-pagination__controls">
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page <= 1"
                @click="emit('update:page', page - 1)"
            >
                Previous
            </button>
            <span class="mv-pagination__page">Page {{ page }} of {{ pageCount }}</span>
            <button
                type="button"
                class="mv-pagination__btn"
                :disabled="page >= pageCount"
                @click="emit('update:page', page + 1)"
            >
                Next
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
