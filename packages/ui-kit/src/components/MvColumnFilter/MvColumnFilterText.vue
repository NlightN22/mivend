<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useDebouncedCallback } from '../../composables/useDebouncedCallback';
import type { TextFilterConfig } from './columnFilterTypes';

const props = defineProps<{ config: TextFilterConfig; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

// Local, immediate state for what the input displays — decoupled from `modelValue` itself (which
// only updates on the debounced emit below). Binding the input's :value directly to `modelValue`
// while a PARENT also debounces at its own end double-debounces the display: the input wouldn't
// visibly accept a keystroke until the parent's own timer fires and writes back down, and any
// reactive state the parent derives from `modelValue` (this table's `tableState.filters`, which
// drives header classes/visible-columns/etc.) still re-renders on every synchronous write to it
// regardless of whether the *emit to the grandparent* was debounced — that re-render is what
// tears down and rebuilds this very input, killing focus mid-word (real, confirmed-live incident,
// twice: once before this component existed, once again here because only the outbound emit was
// debounced, not the parent's own local state write that the emit triggers). Debouncing here,
// fully inside this component with its own untouched-by-the-parent local ref, is the only way to
// guarantee typing itself never causes a re-render upstream.
const localValue = ref(props.modelValue);
watch(
    () => props.modelValue,
    v => {
        if (v !== localValue.value) localValue.value = v;
    },
);

const debouncedEmit = useDebouncedCallback((value: string) => emit('update:modelValue', value), props.config.debounceMs);

function onInput(e: Event): void {
    localValue.value = (e.target as HTMLInputElement).value;
    debouncedEmit(localValue.value);
}
function onClear(): void {
    localValue.value = '';
    emit('update:modelValue', '');
}
</script>

<template>
    <div class="mv-column-filter-text">
        <Search class="mv-column-filter-text__icon" />
        <input
            type="text"
            :value="localValue"
            :placeholder="config.placeholder ?? 'Search…'"
            @input="onInput"
        />
        <button v-if="localValue" type="button" class="mv-column-filter-text__clear" aria-label="Clear" @click="onClear">
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
    color: #98a2b3;
    pointer-events: none;
}

.mv-column-filter-text input {
    width: 100%;
    height: 34px;
    padding: 0 28px 0 28px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
    outline: none;
}

.mv-column-filter-text input:focus {
    border-color: var(--el-color-primary-light-7, #c8f7ec);
    background: #fff;
}

.mv-column-filter-text__clear {
    position: absolute;
    right: 6px;
    border: none;
    background: transparent;
    color: #98a2b3;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
}
</style>
