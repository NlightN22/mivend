<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

// "Operations" and "History" tabs of the Bulk operations menu item; each tab is its own route.
const route = useRoute();
const { t } = useI18n();
const TABS = computed(() => [
    {
        name: 'bulk-operations',
        label: t('bulkOperations.tabs.operations'),
        path: '/bulk-operations',
    },
    {
        name: 'bulk-operations-history',
        label: t('bulkOperations.tabs.history'),
        path: '/bulk-operations/history',
    },
]);
</script>

<template>
    <nav class="bulk-tabs" :aria-label="t('bulkOperations.title')">
        <RouterLink
            v-for="tab in TABS"
            :key="tab.name"
            :to="tab.path"
            class="bulk-tabs__tab"
            :class="{ 'bulk-tabs__tab--active': route.name === tab.name }"
            :aria-current="route.name === tab.name ? 'page' : undefined"
        >
            {{ tab.label }}
        </RouterLink>
    </nav>
</template>

<style scoped>
.bulk-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--el-border-color);
}

.bulk-tabs__tab {
    padding: 8px 16px;
    margin-bottom: -1px;
    border-bottom: 2px solid transparent;
    color: var(--el-text-color-secondary);
    font-weight: 600;
    text-decoration: none;
}

.bulk-tabs__tab--active {
    border-bottom-color: var(--el-color-primary);
    color: var(--el-text-color-primary);
}
</style>
