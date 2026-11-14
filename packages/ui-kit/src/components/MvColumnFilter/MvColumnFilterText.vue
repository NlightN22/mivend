<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { Search } from '@element-plus/icons-vue';
import { useDebouncedTextModel } from '../../composables/useDebouncedTextModel';
import type { TextFilterConfig } from './columnFilterTypes';
const uiLabel = useUiLabels();

const props = defineProps<{ config: TextFilterConfig; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { text, input, clear } = useDebouncedTextModel(
    () => props.modelValue,
    value => emit('update:modelValue', value),
    props.config.debounceMs,
);
</script>

<template>
    <div class="mv-column-filter-text">
        <Search class="mv-column-filter-text__icon" />
        <input
            type="text"
            :value="text"
            :placeholder="config.placeholder ?? 'Search…'"
            @input="input(($event.target as HTMLInputElement).value)"
        />
        <button
            v-if="text"
            type="button"
            class="mv-column-filter-text__clear"
            :aria-label="uiLabel('clear', 'Clear')"
            @click="clear"
        >
            ×
        </button>
    </div>
</template>

<style scoped>
.mv-column-filter-text {
    position: relative;
    display: flex;
    align-items: center;
    width: 220px;
}

.mv-column-filter-text__icon {
    position: absolute;
    left: 8px;
    width: 14px;
    height: 14px;
    color: var(--app-text-placeholder);
    pointer-events: none;
}

.mv-column-filter-text input {
    width: 100%;
    height: 34px;
    padding: 0 28px 0 28px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
    font-size: 13px;
    color: var(--el-text-color-primary);
    outline: none;
}

.mv-column-filter-text input:focus {
    border-color: var(--el-color-primary-light-7);
    background: var(--app-surface);
}

.mv-column-filter-text__clear {
    position: absolute;
    right: 6px;
    border: none;
    background: transparent;
    color: var(--app-text-placeholder);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
}
</style>
