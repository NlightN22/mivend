<script setup lang="ts">
// Yellow attention banner used across manager portal pages (expiring discounts on Dashboard,
// orders needing attention on Orders, ...). See docs/ai/manager-portal-pages/
// 00-shared-conventions.md.
defineProps<{ actionText?: string; actionTo?: string }>();
defineEmits<{ action: [] }>();
</script>

<template>
    <div class="mv-warning-banner">
        <span class="mv-warning-banner__icon">⚠</span>
        <div class="mv-warning-banner__body">
            <slot />
        </div>
        <component
            :is="actionTo ? 'RouterLink' : 'button'"
            v-if="actionText"
            class="mv-warning-banner__action"
            :to="actionTo"
            @click="!actionTo && $emit('action')"
        >
            {{ actionText }}
        </component>
    </div>
</template>

<style scoped>
.mv-warning-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: var(--app-radius-md, 12px);
    padding: 14px 16px;
    margin-bottom: 18px;
    color: #92400e;
}

.mv-warning-banner__icon {
    color: #b45309;
    font-size: 18px;
}

.mv-warning-banner__body {
    flex: 1;
    font-size: 13px;
    line-height: 1.4;
}

.mv-warning-banner__action {
    background: none;
    border: 1px solid #b45309;
    color: #b45309;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    text-decoration: none;
}
</style>
