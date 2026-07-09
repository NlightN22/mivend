<script setup lang="ts">
export interface FilterChip {
    key: string;
    label: string;
}

defineProps<{ chips: FilterChip[]; active: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="filter-chips">
        <button
            v-for="chip in chips"
            :key="chip.key"
            type="button"
            class="filter-chips__chip"
            :class="{ 'filter-chips__chip--active': chip.key === active }"
            @click="emit('select', chip.key)"
        >
            {{ chip.label }}
        </button>
    </div>
</template>

<style scoped>
.filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.filter-chips__chip {
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

.filter-chips__chip:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.filter-chips__chip--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
    border-color: var(--el-color-primary-light-7, #c8f7ec);
}
</style>
