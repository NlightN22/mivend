<script setup lang="ts">
interface BreadcrumbItem {
    label: string;
    to?: string;
}

withDefaults(defineProps<{ items: BreadcrumbItem[]; ariaLabel?: string }>(), {
    ariaLabel: 'Breadcrumb',
});
</script>

<template>
    <nav class="mv-breadcrumbs" :aria-label="ariaLabel">
        <template v-for="(item, i) in items" :key="i">
            <span v-if="i > 0" class="mv-breadcrumbs__sep" aria-hidden="true">/</span>
            <RouterLink v-if="item.to" :to="item.to" class="mv-breadcrumbs__link">
                {{ item.label }}
            </RouterLink>
            <span v-else class="mv-breadcrumbs__current">{{ item.label }}</span>
        </template>
    </nav>
</template>

<style scoped>
.mv-breadcrumbs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    font-size: 13px;
}

.mv-breadcrumbs__link {
    color: var(--app-nav-label);
    text-decoration: none;
    transition: color 0.12s;
}

.mv-breadcrumbs__link:hover {
    color: var(--el-color-primary);
}

.mv-breadcrumbs__sep {
    color: var(--app-nav-text-faint);
}

.mv-breadcrumbs__current {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--app-text-body2);
    font-weight: 600;
}
</style>
