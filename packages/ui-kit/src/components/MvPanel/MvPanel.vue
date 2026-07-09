<script setup lang="ts">
// Backoffice content card with an optional header (title + link/actions) — the "panel" unit
// used throughout the manager portal for grouped content (Recent orders, Quick actions, ...).
defineProps<{ title?: string }>();
</script>

<template>
    <section class="mv-panel">
        <div v-if="title || $slots['header-actions']" class="mv-panel__header">
            <h2 v-if="title" class="mv-panel__title">{{ title }}</h2>
            <div v-if="$slots['header-actions']" class="mv-panel__header-actions">
                <slot name="header-actions" />
            </div>
        </div>
        <div v-if="$slots.subheader" class="mv-panel__subheader">
            <slot name="subheader" />
        </div>
        <div class="mv-panel__body">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.mv-panel {
    background: var(--app-surface, #fff);
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 16px);
    padding: 16px 18px;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}

.mv-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.mv-panel__title {
    font-size: 15px;
    margin: 0;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-panel__header-actions {
    color: var(--el-color-primary-dark-2, #008a70);
    font-weight: 700;
    font-size: 13px;
}

.mv-panel__header-actions :deep(a) {
    color: inherit;
    text-decoration: none;
}

.mv-panel__subheader {
    margin-bottom: 12px;
}
</style>
