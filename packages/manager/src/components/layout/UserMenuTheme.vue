<script setup lang="ts">
import { themePreference, setThemePreference } from '@mivend/ui-kit';
import { THEME_CHOICES } from './userMenuItems';
</script>

<template>
    <div class="user-menu-theme" role="group" aria-label="Theme">
        <span class="user-menu-theme__title">Theme</span>
        <div class="user-menu-theme__segments">
            <button
                v-for="choice in THEME_CHOICES"
                :key="choice.value"
                type="button"
                class="user-menu-theme__segment"
                role="menuitemradio"
                :aria-label="choice.label"
                :title="choice.label"
                :aria-checked="themePreference === choice.value"
                @click.stop="setThemePreference(choice.value)"
            >
                <component :is="choice.icon" :size="18" aria-hidden="true" />
            </button>
        </div>
    </div>
</template>

<style scoped>
.user-menu-theme {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 8px;
    color: var(--app-text-body2);
    font-size: 14px;
}

.user-menu-theme__segments {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: var(--el-fill-color-light);
}

.user-menu-theme__segment {
    display: grid;
    place-items: center;
    width: 36px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    cursor: pointer;
}

.user-menu-theme__segment[aria-checked='true'] {
    border-color: var(--el-border-color);
    background: var(--app-surface);
    color: var(--el-text-color-primary);
}

.user-menu-theme__segment:hover:not([aria-checked='true']),
.user-menu-theme__segment:focus-visible {
    background: var(--app-row-hover);
}
</style>
