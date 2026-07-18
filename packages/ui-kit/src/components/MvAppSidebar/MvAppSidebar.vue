<script setup lang="ts">
import MvCountBadge from '../MvCountBadge/MvCountBadge.vue';

export interface AppSidebarItem {
    label: string;
    path: string;
    badgeCount?: number;
}

withDefaults(defineProps<{ items: AppSidebarItem[]; sectionTitle?: string }>(), {
    sectionTitle: '',
});
</script>

<template>
    <nav class="mv-app-sidebar">
        <div v-if="sectionTitle" class="mv-app-sidebar__section-title">{{ sectionTitle }}</div>
        <ul class="mv-app-sidebar__list">
            <li v-for="item in items" :key="item.path">
                <RouterLink
                    class="mv-app-sidebar__link"
                    :to="item.path"
                    active-class="mv-app-sidebar__link--active"
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
    background: var(--app-surface, #fff);
    border-right: 1px solid var(--el-border-color, #e4e7ec);
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
    color: var(--el-text-color-secondary, #9ca3af);
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
    color: var(--el-text-color-regular, #374151);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
}

.mv-app-sidebar__link:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.mv-app-sidebar__link--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
}

@media (max-width: 800px) {
    .mv-app-sidebar {
        display: none;
    }
}
</style>
