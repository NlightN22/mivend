<script setup lang="ts">
import { themePreference, setThemePreference } from '@mivend/ui-kit';
import { THEME_CHOICES } from './userMenuItems';
</script>

<template>
    <div class="user-menu-theme" role="group" aria-label="Theme">
        <div class="user-menu-theme__title">Theme</div>
        <div class="user-menu-theme__segments">
            <button
                v-for="choice in THEME_CHOICES"
                :key="choice.value"
                type="button"
                class="user-menu-theme__segment"
                role="menuitemradio"
                :aria-checked="themePreference === choice.value"
                @click.stop="setThemePreference(choice.value)"
            >
                {{ choice.label }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.user-menu-theme__title {
    padding: 4px 8px;
    color: var(--app-text-grey);
    font-size: 12px;
}

.user-menu-theme__segments {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: var(--el-fill-color-light);
}

.user-menu-theme__segment {
    flex: 1;
    min-height: 34px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    font-size: 14px;
    cursor: pointer;
}

.user-menu-theme__segment[aria-checked='true'] {
    border-color: var(--el-border-color);
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font-weight: 600;
}

.user-menu-theme__segment:hover:not([aria-checked='true']),
.user-menu-theme__segment:focus-visible {
    background: var(--app-row-hover);
}
</style>
