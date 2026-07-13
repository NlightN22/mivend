<script setup lang="ts">
// Backoffice multi-value picker — checkbox list rather than a native <select multiple> (which is
// hard to scan/use for more than a handful of options). Same option shape as MvSelect.
import type { SelectOption } from '../MvSelect/MvSelect.vue';

const props = defineProps<{ modelValue: string[]; options: SelectOption[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

function toggle(value: string): void {
    const next = props.modelValue.includes(value)
        ? props.modelValue.filter(v => v !== value)
        : [...props.modelValue, value];
    emit('update:modelValue', next);
}
</script>

<template>
    <div class="mv-multi-select">
        <label v-for="option in options" :key="option.value" class="mv-multi-select__option">
            <input
                type="checkbox"
                :checked="modelValue.includes(option.value)"
                @change="toggle(option.value)"
            />
            <span>{{ option.label }}</span>
        </label>
    </div>
</template>

<style scoped>
.mv-multi-select {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 160px;
    overflow-y: auto;
    padding: 8px 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light, #f8fafc);
}

.mv-multi-select__option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    color: var(--el-text-color-primary, #17212b);
    cursor: pointer;
}
</style>
