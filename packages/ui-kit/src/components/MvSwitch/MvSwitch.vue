<script setup lang="ts">
// Pill toggle — for a binary on/off state a user flips directly (e.g. an account's active
// status), as opposed to MvCheckbox (multi-select lists). Deliberately a native
// <input type="checkbox"> under the hood, matching MvCheckbox/MvSelect's "stay light" approach —
// only the visual chrome differs.
withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>(), {
    disabled: false,
});
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
    <label class="mv-switch" :class="{ 'mv-switch--disabled': disabled }">
        <input
            type="checkbox"
            class="mv-switch__input"
            :checked="modelValue"
            :disabled="disabled"
            :aria-label="label"
            @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span class="mv-switch__track"><span class="mv-switch__thumb" /></span>
        <span v-if="label" class="mv-switch__label">{{ label }}</span>
    </label>
</template>

<style scoped>
.mv-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.mv-switch--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-switch__input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}

.mv-switch__track {
    position: relative;
    width: 38px;
    height: 22px;
    flex: none;
    border-radius: 999px;
    background: #cfd7e1;
    transition: background 0.15s;
}

.mv-switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
    transition: transform 0.15s;
}

.mv-switch__input:checked + .mv-switch__track {
    background: var(--el-color-primary, #00b894);
}

.mv-switch__input:checked + .mv-switch__track .mv-switch__thumb {
    transform: translateX(16px);
}

.mv-switch__input:focus-visible + .mv-switch__track {
    outline: 2px solid var(--el-color-primary, #00b894);
    outline-offset: 2px;
}

.mv-switch__label {
    font-size: 13px;
    color: var(--el-text-color-primary, #17212b);
}
</style>
