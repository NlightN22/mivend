<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

// Plain backoffice checkbox — used for multi-toggle lists (e.g. role permissions). Deliberately
// a native <input type="checkbox">, not Element Plus, matching MvSelect's "stay light" approach.
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        label?: string;
        disabled?: boolean;
        // "Some, but not all, of this checkbox's group are selected" — e.g. a select-all header
        // checkbox when only part of the current page is checked. `indeterminate` is a DOM
        // property, not an HTML attribute (no `indeterminate="..."` exists), so it can't be bound
        // directly in the template and needs a ref + watcher instead (see MvAdvancedDataTable's
        // select-all header checkbox for the real consumer).
        indeterminate?: boolean;
        // Validation failed for this box: a red outline, same colour as an invalid MvInput.
        error?: boolean;
        // Long labels wrap; the box stays level with the first line.
        multiline?: boolean;
    }>(),
    {
        disabled: false,
        indeterminate: false,
        error: false,
        multiline: false,
    },
);
defineEmits<{ 'update:modelValue': [value: boolean] }>();

const inputEl = ref<HTMLInputElement | null>(null);
// The template ref isn't assigned yet during setup (only after mount), so `immediate: true`
// alone would miss the very first indeterminate value — onMounted covers that initial sync,
// the watcher covers every value change after.
onMounted(() => {
    if (inputEl.value) inputEl.value.indeterminate = props.indeterminate;
});
watch(
    () => props.indeterminate,
    value => {
        if (inputEl.value) inputEl.value.indeterminate = value;
    },
);
</script>

<template>
    <label
        class="mv-checkbox"
        :class="{
            'mv-checkbox--disabled': disabled,
            'mv-checkbox--error': error,
            'mv-checkbox--multiline': multiline,
        }"
    >
        <input
            ref="inputEl"
            type="checkbox"
            class="mv-checkbox__input"
            :checked="modelValue"
            :disabled="disabled"
            :aria-invalid="error || undefined"
            @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span v-if="label" class="mv-checkbox__label">{{ label }}</span>
        <slot v-else />
    </label>
</template>

<style scoped>
.mv-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--el-text-color-primary);
}

.mv-checkbox--multiline {
    align-items: flex-start;
}

.mv-checkbox--multiline .mv-checkbox__input {
    margin-top: 1px;
}

.mv-checkbox--error .mv-checkbox__input {
    outline: 2px solid var(--app-danger-btn);
    outline-offset: 1px;
}

.mv-checkbox--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-checkbox__input {
    width: 16px;
    height: 16px;
    flex: none;
    accent-color: var(--el-color-primary);
    border-radius: var(--app-radius-sm, 8px);
    cursor: inherit;
}

.mv-checkbox__label {
    line-height: 1.3;
}
</style>
