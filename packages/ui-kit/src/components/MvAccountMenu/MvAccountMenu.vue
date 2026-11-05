<script setup lang="ts">
import { computed, reactive, ref, type Component } from 'vue';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconLogout,
    IconWorld,
} from '@tabler/icons-vue';
import type { LanguageOption } from '../MvLanguageSwitcher/MvLanguageSwitcher.vue';

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
        logoutLabel?: string;
    }>(),
    { userRole: '', languageLabel: 'Interface language', logoutLabel: 'Log out' },
);

const emit = defineEmits<{
    navigate: [];
    'select-language': [code: string];
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
                <button
                    v-if="entry.children"
                    type="button"
                    class="mv-account-menu__item"
                    :aria-expanded="isGroupOpen(entry)"
                    @click="expanded[entry.key] = !isGroupOpen(entry)"
                >
                    <component
                        :is="entry.icon"
                        v-if="entry.icon"
                        :size="20"
                        class="mv-account-menu__icon"
                        aria-hidden="true"
                    />
                    <span class="mv-account-menu__label">{{ entry.label }}</span>
                    <component
                        :is="isGroupOpen(entry) ? IconChevronDown : IconChevronRight"
                        :size="18"
                        aria-hidden="true"
                    />
                </button>
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
                <div v-if="entry.children && isGroupOpen(entry)" class="mv-account-menu__sub">
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
                </div>
            </template>
        </nav>

        <div class="mv-account-menu__lang-block">
            <button
                type="button"
                class="mv-account-menu__item"
                :aria-expanded="languageOpen"
                @click="languageOpen = !languageOpen"
            >
                <IconWorld :size="20" class="mv-account-menu__icon" aria-hidden="true" />
                <span class="mv-account-menu__label">{{ languageLabel }}</span>
                <span class="mv-account-menu__current">{{ currentLanguageName }}</span>
                <component
                    :is="languageOpen ? IconChevronDown : IconChevronRight"
                    :size="18"
                    aria-hidden="true"
                />
            </button>
            <div v-if="languageOpen" class="mv-account-menu__sub">
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

<style scoped>
.mv-account-menu {
    display: flex;
    flex-direction: column;
    font-family: inherit;
    color: var(--app-nav-text-strong);
}

.mv-account-menu__user {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 4px 14px;
    border-bottom: 1px solid var(--app-nav-border);
}

.mv-account-menu__avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    display: grid;
    place-items: center;
    font-size: 17px;
    font-weight: 900;
    flex-shrink: 0;
}

.mv-account-menu__user-text {
    min-width: 0;
}

.mv-account-menu__name {
    font-size: 15px;
    font-weight: 900;
    overflow-wrap: anywhere;
}

.mv-account-menu__role {
    font-size: 12px;
    color: var(--app-nav-label);
}

.mv-account-menu__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0;
    border-bottom: 1px solid var(--app-nav-border);
}

.mv-account-menu__item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--app-radius-md);
    background: transparent;
    color: var(--app-nav-text-strong);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
        background 0.14s,
        color 0.14s;
}

.mv-account-menu__item:hover {
    background: var(--app-nav-hover-bg);
}

.mv-account-menu__item:active {
    background: var(--app-nav-active-bg);
}

.mv-account-menu__item:focus-visible {
    outline: 2px solid var(--app-nav-accent);
    outline-offset: -2px;
}

.mv-account-menu__icon {
    flex-shrink: 0;
    color: var(--app-nav-label);
}

.mv-account-menu__item--active .mv-account-menu__icon {
    color: var(--app-nav-accent);
}

.mv-account-menu__item--active {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-weight: 900;
}

.mv-account-menu__item--sub {
    padding-left: 28px;
    font-weight: 600;
}

.mv-account-menu__label {
    flex: 1;
    min-width: 0;
}

.mv-account-menu__count {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--app-nav-border);
    font-size: 12px;
    font-weight: 800;
    display: grid;
    place-items: center;
}

.mv-account-menu__lang-block {
    padding: 10px 0;
    border-bottom: 1px solid var(--app-nav-border);
    margin-bottom: 8px;
}

.mv-account-menu__current {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-nav-label);
}

.mv-account-menu__item--danger {
    color: var(--el-color-danger, #d92d20);
    font-weight: 800;
}

.mv-account-menu__item--danger:hover {
    background: var(--el-color-danger-light-9, #fef3f2);
}
</style>
