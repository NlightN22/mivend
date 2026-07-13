<script setup lang="ts">
// Plain backoffice checkbox — used for multi-toggle lists (e.g. role permissions). Deliberately
// a native <input type="checkbox">, not Element Plus, matching MvSelect's "stay light" approach.
withDefaults(defineProps<{ modelValue: boolean; label?: string; disabled?: boolean }>(), {
    disabled: false,
});
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
    <label class="mv-checkbox" :class="{ 'mv-checkbox--disabled': disabled }">
        <input
            type="checkbox"
            class="mv-checkbox__input"
            :checked="modelValue"
            :disabled="disabled"
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
    color: var(--el-text-color-primary, #17212b);
}

.mv-checkbox--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-checkbox__input {
    width: 16px;
    height: 16px;
    accent-color: var(--el-color-primary, #00b894);
    border-radius: var(--app-radius-sm, 8px);
    cursor: inherit;
}

.mv-checkbox__label {
    line-height: 1.3;
}
</style>
