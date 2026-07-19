<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import type { SelectFilterConfig } from './columnFilterTypes';

const props = defineProps<{ config: SelectFilterConfig; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent): void {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

const selectedLabel = computed(() => props.config.options.find(o => o.value === props.modelValue)?.label);

function select(value: string): void {
    emit('update:modelValue', value);
    open.value = false;
}
</script>

<template>
    <div ref="rootEl" class="mv-column-filter-select">
        <button type="button" class="mv-column-filter-select__trigger" @click="open = !open">
            <span :class="{ 'mv-column-filter-select__placeholder': !selectedLabel }">
                {{ selectedLabel ?? config.placeholder ?? 'Any' }}
            </span>
            <button
                v-if="modelValue"
                type="button"
                class="mv-column-filter-select__clear"
                aria-label="Clear"
                @click.stop="emit('update:modelValue', '')"
            >
                ×
            </button>
            <ArrowDown v-else class="mv-column-filter-select__arrow" />
        </button>
        <div v-if="open" class="mv-column-filter-select__panel">
            <button
                v-for="option in config.options"
                :key="option.value"
                type="button"
                class="mv-column-filter-select__option"
                :class="{ 'mv-column-filter-select__option--active': option.value === modelValue }"
                @click="select(option.value)"
            >
                {{ option.label }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.mv-column-filter-select {
    position: relative;
    width: 220px;
}

.mv-column-filter-select__trigger {
    width: 100%;
    height: 34px;
    padding: 0 8px 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
    cursor: pointer;
}

.mv-column-filter-select__placeholder {
    color: #98a2b3;
}

.mv-column-filter-select__arrow {
    width: 12px;
    height: 12px;
    color: #98a2b3;
    flex-shrink: 0;
}

.mv-column-filter-select__clear {
    border: none;
    background: transparent;
    color: #98a2b3;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
}

.mv-column-filter-select__panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 30;
    max-height: 220px;
    overflow-y: auto;
    background: white;
    border: 1px solid #e4e7ec;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(20, 42, 65, 0.12);
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mv-column-filter-select__option {
    text-align: left;
    border: none;
    background: transparent;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
    cursor: pointer;
}

.mv-column-filter-select__option:hover {
    background: #f8fafc;
}

.mv-column-filter-select__option--active {
    color: var(--el-color-primary, #00b894);
    font-weight: 600;
}
</style>
