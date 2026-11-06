<script setup lang="ts">
export type InputSize = 'md' | 'sm';

withDefaults(
    defineProps<{
        modelValue: string;
        type?: string;
        placeholder?: string;
        disabled?: boolean;
        error?: boolean;
        autocomplete?: string;
        size?: InputSize;
        list?: string;
        inputmode?: 'text' | 'tel' | 'numeric' | 'email';
        maxlength?: number;
    }>(),
    { size: 'md' },
);

defineEmits<{
    'update:modelValue': [value: string];
}>();
</script>

<template>
    <input
        :class="[
            'mv-input',
            `mv-input--${size}`,
            { 'mv-input--error': error, 'mv-input--disabled': disabled },
        ]"
        :type="type ?? 'text'"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :autocomplete="autocomplete"
        :list="list"
        :inputmode="inputmode"
        :maxlength="maxlength"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
</template>

<style scoped>
.mv-input {
    display: block;
    width: 100%;
    min-height: 52px;
    padding: 0 15px;
    border: 1px solid var(--el-border-color);
    border-radius: 16px;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font-size: 15px;
    font-family: var(--app-font-family, Inter, system-ui, sans-serif);
    font-weight: 600;
    outline: none;
    transition:
        border-color 0.15s,
        box-shadow 0.15s;
    box-sizing: border-box;
}

.mv-input::placeholder {
    color: var(--el-text-color-secondary);
    font-weight: 400;
}

.mv-input:focus {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 4px var(--app-green-glow);
}

.mv-input--error {
    border-color: var(--app-danger-btn);
}

.mv-input--error:focus {
    box-shadow: 0 0 0 4px var(--app-danger-glow);
}

.mv-input--disabled {
    opacity: 0.5;
    pointer-events: none;
    background: var(--app-slate-bg);
}

/* Compact density for backoffice filter bars (manager portal) — see
   docs/ai/manager-portal-pages/00-shared-conventions.md, "FilterBar". */
.mv-input--sm {
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--app-radius-md, 12px);
    font-size: 14px;
    font-weight: 400;
    background: var(--el-fill-color-light);
}
</style>
