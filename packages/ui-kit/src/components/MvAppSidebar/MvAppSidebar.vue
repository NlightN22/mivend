<script setup lang="ts">
import { reactive } from 'vue';
import { useRoute } from 'vue-router';
import { IconChevronDown } from '@tabler/icons-vue';
import MvCountBadge from '../MvCountBadge/MvCountBadge.vue';
import { groupBadgeCount, isGroupActive, isPathActive } from './sidebar-items';
import type { AppSidebarItem } from './sidebar-items';

withDefaults(defineProps<{ items: AppSidebarItem[]; sectionTitle?: string }>(), {
    sectionTitle: '',
});

const route = useRoute();
const toggled = reactive<Record<string, boolean>>({});

function isExpanded(group: AppSidebarItem): boolean {
    return toggled[group.label] ?? isGroupActive(route.path, group);
}

function toggle(group: AppSidebarItem): void {
    toggled[group.label] = !isExpanded(group);
}
</script>

<template>
    <nav class="mv-app-sidebar">
        <div v-if="sectionTitle" class="mv-app-sidebar__section-title">{{ sectionTitle }}</div>
        <ul class="mv-app-sidebar__list">
            <li v-for="item in items" :key="item.label">
                <template v-if="item.children">
                    <button
                        type="button"
                        class="mv-app-sidebar__link mv-app-sidebar__group"
                        :class="{ 'mv-app-sidebar__link--active': isGroupActive(route.path, item) }"
                        :aria-expanded="isExpanded(item)"
                        @click="toggle(item)"
                    >
                        <span>{{ item.label }}</span>
                        <span class="mv-app-sidebar__group-tail">
                            <MvCountBadge
                                v-if="!isExpanded(item) && groupBadgeCount(item)"
                                :count="groupBadgeCount(item)"
                            />
                            <IconChevronDown
                                :size="16"
                                class="mv-app-sidebar__chevron"
                                :class="{ 'mv-app-sidebar__chevron--open': isExpanded(item) }"
                            />
                        </span>
                    </button>
                    <ul
                        v-if="isExpanded(item)"
                        class="mv-app-sidebar__list mv-app-sidebar__sublist"
                    >
                        <li v-for="child in item.children" :key="child.path">
                            <RouterLink
                                class="mv-app-sidebar__link"
                                :class="{
                                    'mv-app-sidebar__link--active': isPathActive(
                                        route.path,
                                        child.path ?? '',
                                    ),
                                }"
                                :to="child.path ?? ''"
                            >
                                <span>{{ child.label }}</span>
                                <MvCountBadge v-if="child.badgeCount" :count="child.badgeCount" />
                            </RouterLink>
                        </li>
                    </ul>
                </template>
                <RouterLink
                    v-else
                    class="mv-app-sidebar__link"
                    :class="{
                        'mv-app-sidebar__link--active': isPathActive(route.path, item.path ?? ''),
                    }"
                    :to="item.path ?? ''"
                >
                    <span>{{ item.label }}</span>
                    <MvCountBadge v-if="item.badgeCount" :count="item.badgeCount" />
                </RouterLink>
            </li>
        </ul>
    </nav>
</template>

<style scoped>
.mv-app-sidebar {
    width: 224px;
    flex-shrink: 0;
    background: var(--app-surface);
    border-right: 1px solid var(--el-border-color);
    padding: 20px 12px;
    position: sticky;
    top: 64px;
    height: calc(100vh - 64px);
}

.mv-app-sidebar__section-title {
    padding: 0 10px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.mv-app-sidebar__list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.mv-app-sidebar__link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--app-radius-md, 12px);
    color: var(--el-text-color-regular);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
}

.mv-app-sidebar__group {
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
}

.mv-app-sidebar__group-tail {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.mv-app-sidebar__chevron {
    transition: transform 0.15s ease;
}

.mv-app-sidebar__chevron--open {
    transform: rotate(180deg);
}

.mv-app-sidebar__sublist {
    padding-left: 12px;
}

.mv-app-sidebar__link:hover {
    background: var(--el-fill-color-light);
}

.mv-app-sidebar__link--active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary-dark-2);
}

@media (max-width: 800px) {
    .mv-app-sidebar {
        display: none;
    }
}
</style>
