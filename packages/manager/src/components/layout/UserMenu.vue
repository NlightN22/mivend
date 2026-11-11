<script setup lang="ts">
import { ref } from 'vue';
import { themePreference, setThemePreference, type ThemePreference } from '@mivend/ui-kit';
import { USER_MENU_GROUPS, THEME_CHOICES } from './userMenuItems';

defineEmits<{ logout: [] }>();

const menu = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent): void {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!step || !menu.value) return;
    const items = [...menu.value.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + step + items.length) % items.length]?.focus();
    event.preventDefault();
}

function chooseTheme(value: ThemePreference): void {
    setThemePreference(value);
}
</script>

<template>
    <div ref="menu" class="user-menu" role="menu" aria-label="Account" @keydown="onKeydown">
        <div v-for="group in USER_MENU_GROUPS" :key="group.label" class="user-menu__group">
            <div class="user-menu__group-title">{{ group.label }}</div>
            <RouterLink
                v-for="item in group.items"
                data-popover-autofocus
                :key="item.to"
                :to="item.to"
                class="user-menu__item"
                role="menuitem"
            >
                {{ item.label }}
            </RouterLink>
        </div>
        <div class="user-menu__group" role="group" aria-label="Theme">
            <div class="user-menu__group-title">Theme</div>
            <button
                v-for="choice in THEME_CHOICES"
                :key="choice.value"
                type="button"
                class="user-menu__item user-menu__item--choice"
                role="menuitemradio"
                :aria-checked="themePreference === choice.value"
                @click.stop="chooseTheme(choice.value)"
            >
                {{ choice.label }}
                <span v-if="themePreference === choice.value" aria-hidden="true">✓</span>
            </button>
        </div>
        <button
            type="button"
            class="user-menu__item user-menu__item--logout"
            role="menuitem"
            @click="$emit('logout')"
        >
            Log out
        </button>
    </div>
</template>

<style scoped>
.user-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.user-menu__group-title {
    padding: 4px 8px;
    color: var(--app-text-grey);
    font-size: 12px;
}

.user-menu__item {
    display: block;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--app-text-body2);
    font-size: 14px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
}

.user-menu__item--choice {
    display: flex;
    justify-content: space-between;
}

.user-menu__item--choice[aria-checked='true'] {
    font-weight: 600;
}

.user-menu__item--logout {
    margin-top: 4px;
    border-top: 1px solid var(--el-border-color);
    border-radius: 0 0 8px 8px;
    padding-top: 12px;
}

.user-menu__item:hover,
.user-menu__item:focus-visible {
    background: var(--app-row-hover);
}
</style>
