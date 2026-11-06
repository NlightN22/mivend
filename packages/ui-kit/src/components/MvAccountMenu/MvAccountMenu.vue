<script setup lang="ts">
import { computed, reactive, ref, type Component } from 'vue';
import {
    IconCheck,
    IconLogout,
    IconMoon,
    IconSun,
    IconSunMoon,
    IconWorld,
} from '@tabler/icons-vue';
import MvAccountMenuGroup from './MvAccountMenuGroup.vue';
import type { LanguageOption } from '../MvLanguageSwitcher/MvLanguageSwitcher.vue';

export interface ThemeOption {
    value: string;
    label: string;
}

export interface AccountMenuLink {
    key: string;
    label: string;
    to: string;
    count?: number;
}

export interface AccountMenuEntry {
    key: string;
    label: string;
    to?: string;
    icon?: Component;
    count?: number;
    children?: AccountMenuLink[];
}

const props = withDefaults(
    defineProps<{
        userName: string;
        userRole?: string;
        userInitials: string;
        entries: AccountMenuEntry[];
        activePath: string;
        languages: LanguageOption[];
        locale: string;
        languageLabel?: string;
        themes?: ThemeOption[];
        theme?: string;
        themeLabel?: string;
        logoutLabel?: string;
    }>(),
    {
        userRole: '',
        languageLabel: 'Interface language',
        themes: () => [],
        theme: 'system',
        themeLabel: 'Theme',
        logoutLabel: 'Log out',
    },
);

const emit = defineEmits<{
    navigate: [];
    'select-language': [code: string];
    'select-theme': [value: string];
    logout: [];
}>();

const expanded = reactive<Record<string, boolean>>({});

const languageOpen = ref(false);
const currentLanguageName = computed(
    () => props.languages.find(l => l.code === props.locale)?.nativeName ?? props.locale,
);

function selectLanguage(code: string): void {
    languageOpen.value = false;
    emit('select-language', code);
}

const THEME_ICONS: Record<string, Component> = {
    system: IconSunMoon,
    light: IconSun,
    dark: IconMoon,
};

function isActive(to: string): boolean {
    return props.activePath === to;
}

function isGroupOpen(entry: AccountMenuEntry): boolean {
    return expanded[entry.key] ?? !!entry.children?.some(c => isActive(c.to));
}
</script>

<template>
    <div class="mv-account-menu">
        <div class="mv-account-menu__user">
            <span class="mv-account-menu__avatar" aria-hidden="true">{{ userInitials }}</span>
            <div class="mv-account-menu__user-text">
                <div class="mv-account-menu__name">{{ userName }}</div>
                <div v-if="userRole" class="mv-account-menu__role">{{ userRole }}</div>
            </div>
        </div>

        <nav class="mv-account-menu__list">
            <template v-for="entry in entries" :key="entry.key">
                <MvAccountMenuGroup
                    v-if="entry.children"
                    :id="`mv-account-menu-${entry.key}`"
                    :label="entry.label"
                    :icon="entry.icon"
                    :open="isGroupOpen(entry)"
                    @toggle="expanded[entry.key] = !isGroupOpen(entry)"
                >
                    <RouterLink
                        v-for="child in entry.children"
                        :key="child.key"
                        :to="child.to"
                        class="mv-account-menu__item mv-account-menu__item--sub"
                        :class="{ 'mv-account-menu__item--active': isActive(child.to) }"
                        :aria-current="isActive(child.to) ? 'page' : undefined"
                        @click="emit('navigate')"
                    >
                        <span class="mv-account-menu__label">{{ child.label }}</span>
                        <span v-if="child.count" class="mv-account-menu__count">{{
                            child.count
                        }}</span>
                    </RouterLink>
                </MvAccountMenuGroup>
                <RouterLink
                    v-else-if="entry.to"
                    :to="entry.to"
                    class="mv-account-menu__item"
                    :class="{ 'mv-account-menu__item--active': isActive(entry.to) }"
                    :aria-current="isActive(entry.to) ? 'page' : undefined"
                    @click="emit('navigate')"
                >
                    <component
                        :is="entry.icon"
                        v-if="entry.icon"
                        :size="20"
                        class="mv-account-menu__icon"
                        aria-hidden="true"
                    />
                    <span class="mv-account-menu__label">{{ entry.label }}</span>
                    <span v-if="entry.count" class="mv-account-menu__count">{{ entry.count }}</span>
                </RouterLink>
            </template>
        </nav>

        <div class="mv-account-menu__lang-block">
            <MvAccountMenuGroup
                id="mv-account-menu-language"
                :label="languageLabel"
                :icon="IconWorld"
                :current="currentLanguageName"
                :open="languageOpen"
                @toggle="languageOpen = !languageOpen"
            >
                <button
                    v-for="lang in languages"
                    :key="lang.code"
                    type="button"
                    class="mv-account-menu__item mv-account-menu__item--sub"
                    :class="{ 'mv-account-menu__item--active': lang.code === locale }"
                    :aria-pressed="lang.code === locale"
                    @click="selectLanguage(lang.code)"
                >
                    <span class="mv-account-menu__label">{{ lang.nativeName }}</span>
                    <IconCheck v-if="lang.code === locale" :size="18" aria-hidden="true" />
                </button>
            </MvAccountMenuGroup>
        </div>

        <div v-if="themes.length" class="mv-account-menu__theme-block">
            <div class="mv-account-menu__theme-label">{{ themeLabel }}</div>
            <div class="mv-account-menu__theme" role="group" :aria-label="themeLabel">
                <button
                    v-for="option in themes"
                    :key="option.value"
                    type="button"
                    class="mv-account-menu__theme-btn"
                    :class="{ 'mv-account-menu__theme-btn--active': option.value === theme }"
                    :aria-pressed="option.value === theme"
                    @click="emit('select-theme', option.value)"
                >
                    <component
                        :is="THEME_ICONS[option.value]"
                        v-if="THEME_ICONS[option.value]"
                        :size="18"
                        aria-hidden="true"
                    />
                    <span>{{ option.label }}</span>
                </button>
            </div>
        </div>

        <button
            type="button"
            class="mv-account-menu__item mv-account-menu__item--danger"
            @click="emit('logout')"
        >
            <IconLogout :size="20" aria-hidden="true" />
            <span class="mv-account-menu__label">{{ logoutLabel }}</span>
        </button>
    </div>
</template>

<style src="./MvAccountMenu.css"></style>
