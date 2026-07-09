<script setup lang="ts">
// Plain backoffice <select> wrapper — filter dropdowns across the manager portal (status,
// date range, manager, ...). Deliberately native, not Element Plus, to stay light for simple
// option lists; revisit if a page needs search-within-options.
export interface SelectOption {
    value: string;
    label: string;
}

defineProps<{ modelValue: string; options: SelectOption[] }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <select
        class="mv-select"
        :value="modelValue"
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
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    color: var(--el-text-color-primary, #17212b);
    font-size: 14px;
    outline: none;
}

.mv-select:focus {
    border-color: var(--el-color-primary-light-7, #c8f7ec);
    box-shadow: 0 0 0 4px var(--el-color-primary-light-9, #f0fffa);
    background: #fff;
}
</style>
