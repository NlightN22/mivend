<script setup lang="ts">
import type { BooleanFilterConfig, BooleanFilterValue } from './columnFilterTypes';

const props = defineProps<{ config: BooleanFilterConfig; modelValue: BooleanFilterValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: BooleanFilterValue] }>();

const OPTIONS: { value: BooleanFilterValue; fallbackLabel: string }[] = [
    { value: 'any', fallbackLabel: 'Any' },
    { value: 'yes', fallbackLabel: 'Yes' },
    { value: 'no', fallbackLabel: 'No' },
];
function labelFor(value: BooleanFilterValue, fallback: string): string {
    return props.config.labels?.[value] ?? fallback;
}
</script>

<template>
    <div class="mv-column-filter-boolean">
        <button
            v-for="option in OPTIONS"
            :key="option.value"
            type="button"
            class="mv-column-filter-boolean__btn"
            :class="{ 'mv-column-filter-boolean__btn--active': modelValue === option.value }"
            @click="emit('update:modelValue', option.value)"
        >
            {{ labelFor(option.value, option.fallbackLabel) }}
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-boolean {
    display: flex;
    gap: 4px;
    background: #f2f4f7;
    border-radius: 8px;
    padding: 3px;
    width: fit-content;
}

.mv-column-filter-boolean__btn {
    border: none;
    background: transparent;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.mv-column-filter-boolean__btn--active {
    background: white;
    color: var(--el-color-primary, #00b894);
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}
</style>
