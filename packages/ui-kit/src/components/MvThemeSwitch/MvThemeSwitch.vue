<script setup lang="ts">
import type { Component } from 'vue';
import { IconMoon, IconSun, IconSunMoon } from '@tabler/icons-vue';

export interface ThemeOption {
    value: string;
    label: string;
}

withDefaults(
    defineProps<{
        options: ThemeOption[];
        modelValue: string;
        ariaLabel?: string;
        compact?: boolean;
    }>(),
    { ariaLabel: 'Theme', compact: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const ICONS: Record<string, Component> = {
    system: IconSunMoon,
    light: IconSun,
    dark: IconMoon,
};
</script>

<template>
    <div
        class="mv-theme-switch"
        :class="{ 'mv-theme-switch--compact': compact }"
        role="group"
        :aria-label="ariaLabel"
    >
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="mv-theme-switch__btn"
            :class="{ 'mv-theme-switch__btn--active': option.value === modelValue }"
            :aria-pressed="option.value === modelValue"
            :aria-label="compact ? option.label : undefined"
            :title="compact ? option.label : undefined"
            @click="emit('update:modelValue', option.value)"
        >
            <component
                :is="ICONS[option.value]"
                v-if="ICONS[option.value]"
                :size="18"
                aria-hidden="true"
            />
            <span v-if="!compact">{{ option.label }}</span>
        </button>
    </div>
</template>

<style src="./MvThemeSwitch.css"></style>
