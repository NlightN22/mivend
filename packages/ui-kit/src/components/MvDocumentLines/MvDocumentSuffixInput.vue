<script setup lang="ts">
defineProps<{
    modelValue: string;
    suffix: string;
    placeholder?: string;
    disabled?: boolean;
    label: string;
    invalid?: boolean;
}>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <label class="doc-suffix" :class="{ 'doc-suffix--invalid': invalid }">
        <input
            class="doc-suffix__input"
            type="number"
            step="any"
            inputmode="decimal"
            :value="modelValue"
            :placeholder="placeholder"
            :disabled="disabled"
            :aria-label="label"
            @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <span class="doc-suffix__unit">{{ suffix }}</span>
    </label>
</template>

<style scoped>
.doc-suffix {
    display: inline-flex;
    align-items: center;
    width: 100px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
}

.doc-suffix:focus-within {
    border-color: var(--app-primary-btn);
}

.doc-suffix--invalid {
    border-color: var(--app-danger-btn);
}

.doc-suffix__input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: right;
    appearance: textfield;
}

.doc-suffix__input::-webkit-inner-spin-button {
    appearance: none;
}

.doc-suffix__unit {
    margin-left: 4px;
    color: var(--app-text-grey);
}
</style>
