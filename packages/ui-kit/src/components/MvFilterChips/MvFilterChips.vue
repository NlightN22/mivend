<script setup lang="ts">
// Quick-filter chip row — reused across manager portal pages (Dashboard, Orders, Discounts)
// wherever a saved/quick filter selector sits above a table, below the main filter widget.
export interface FilterChip {
    key: string;
    label: string;
}

defineProps<{ chips: FilterChip[]; active: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="mv-filter-chips">
        <button
            v-for="chip in chips"
            :key="chip.key"
            type="button"
            class="mv-filter-chip"
            :class="{ 'mv-filter-chip--active': chip.key === active }"
            @click="emit('select', chip.key)"
        >
            {{ chip.label }}
        </button>
    </div>
</template>

<style scoped>
.mv-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.mv-filter-chip {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 999px;
    background: #fff;
    color: var(--el-text-color-regular, #374151);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
}

.mv-filter-chip:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.mv-filter-chip--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
    border-color: var(--el-color-primary-light-7, #c8f7ec);
}

/* Higher specificity than .mv-filter-chip:hover (two classes vs one class + pseudo-class) so
   hovering an already-active chip stays in its active appearance instead of falling back to
   the plain hover background. */
.mv-filter-chip--active:hover {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
    border-color: var(--el-color-primary-light-7, #c8f7ec);
}
</style>
