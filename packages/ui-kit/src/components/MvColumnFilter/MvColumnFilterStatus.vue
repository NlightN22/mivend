<script setup lang="ts">
import { computed, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvStatusBadge from '../MvStatusBadge/MvStatusBadge.vue';
import type { StatusFilterConfig } from './columnFilterTypes';

const props = defineProps<{ config: StatusFilterConfig; modelValue: string | string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>();

const search = ref('');
const filteredOptions = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return props.config.options;
    return props.config.options.filter(o => o.label.toLowerCase().includes(term));
});

const selectedValues = computed<string[]>(() =>
    Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [],
);

function isSelected(value: string): boolean {
    return selectedValues.value.includes(value);
}
function toggle(value: string): void {
    if (props.config.multiple) {
        const next = isSelected(value) ? selectedValues.value.filter(v => v !== value) : [...selectedValues.value, value];
        emit('update:modelValue', next);
    } else {
        emit('update:modelValue', isSelected(value) ? '' : value);
    }
}
function clearAll(): void {
    emit('update:modelValue', props.config.multiple ? [] : '');
}
</script>

<template>
    <div class="mv-column-filter-status">
        <div class="mv-column-filter-status__search">
            <Search class="mv-column-filter-status__search-icon" />
            <input v-model="search" type="text" :placeholder="config.placeholder ?? 'Search status…'" />
        </div>
        <div class="mv-column-filter-status__list">
            <label v-for="option in filteredOptions" :key="option.value" class="mv-column-filter-status__row">
                <MvCheckbox v-if="config.multiple" :model-value="isSelected(option.value)" @update:model-value="toggle(option.value)" />
                <input v-else type="radio" :checked="isSelected(option.value)" @change="toggle(option.value)" />
                <MvStatusBadge :variant="option.variant">{{ option.label }}</MvStatusBadge>
            </label>
            <div v-if="filteredOptions.length === 0" class="mv-column-filter-status__empty">No matches</div>
        </div>
        <button v-if="selectedValues.length > 0" type="button" class="mv-column-filter-status__clear-all" @click="clearAll">
            Clear all
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-status {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 220px;
}

.mv-column-filter-status__search {
    position: relative;
    display: flex;
    align-items: center;
}

.mv-column-filter-status__search-icon {
    position: absolute;
    left: 8px;
    width: 14px;
    height: 14px;
    color: #98a2b3;
    pointer-events: none;
}

.mv-column-filter-status__search input {
    width: 100%;
    padding: 6px 8px 6px 28px;
    border: 1px solid #e4e7ec;
    border-radius: 6px;
    font-size: 13px;
}

.mv-column-filter-status__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 220px;
    overflow-y: auto;
}

.mv-column-filter-status__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
}

.mv-column-filter-status__row:hover {
    background: #f8fafc;
}

.mv-column-filter-status__empty {
    padding: 8px 6px;
    font-size: 12px;
    color: #98a2b3;
    text-align: center;
}

.mv-column-filter-status__clear-all {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--el-color-primary, #00b894);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
</style>
