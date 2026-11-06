<script setup lang="ts">
export type NoticeVariant = 'info' | 'warning' | 'success' | 'error';

defineProps<{
    variant?: NoticeVariant;
}>();
</script>

<template>
    <div :class="['mv-notice', `mv-notice--${variant ?? 'info'}`]" role="note">
        <slot />
    </div>
</template>

<style scoped>
.mv-notice {
    padding: 13px 14px;
    border-radius: 18px;
    border: 1px solid transparent;
    font-size: 13px;
    line-height: 1.45;
}

.mv-notice--info {
    background: var(--app-nav-active-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok2-fg);
}

.mv-notice--success {
    background: var(--app-ok-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok-fg);
}

.mv-notice--warning {
    background: var(--app-warn2-bg);
    border-color: var(--app-orange-glow);
    color: var(--app-warn2-fg);
}

.mv-notice--error {
    background: var(--app-danger2-bg);
    border-color: var(--app-danger-glow);
    color: var(--app-danger2-fg);
}
</style>
