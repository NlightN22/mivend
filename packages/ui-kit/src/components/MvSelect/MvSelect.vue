<script setup lang="ts">
// Backoffice select — native <select> for short option lists, a type-to-search picker above
// SEARCHABLE_OPTION_COUNT options (manager, branch, ...), so every caller gets search for free.
import { computed } from 'vue';
import { SEARCHABLE_OPTION_COUNT } from '../MvColumnFilter/filterOptionsByQuery';
import MvSearchSelect from './MvSearchSelect.vue';

export interface SelectOption {
    value: string;
    label: string;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: SelectOption[];
        disabled?: boolean;
        title?: string;
    }>(),
    { disabled: false, title: '' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
const searchable = computed(() => props.options.length > SEARCHABLE_OPTION_COUNT);
</script>

<template>
    <MvSearchSelect
        v-if="searchable"
        :model-value="modelValue"
        :options="options"
        :disabled="disabled"
        :title="title"
        @update:model-value="$emit('update:modelValue', $event)"
    />
    <select
        v-else
        class="mv-select"
        :value="modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
        <option v-for="option in options" :key="option.value" :value="option.value">
            {{ option.label }}
        </option>
    </select>
</template>

<style scoped>
.mv-select {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
}

.mv-select:focus {
    border-color: var(--el-color-primary-light-7);
    box-shadow: 0 0 0 4px var(--el-color-primary-light-9);
    background: var(--app-surface);
}

.mv-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
