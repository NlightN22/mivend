<script setup lang="ts">
withDefaults(
    defineProps<{
        title?: string;
        message?: string;
        size?: 'page' | 'widget';
    }>(),
    {
        title: 'Not implemented yet',
        message: 'This section is under development and will be available soon.',
        size: 'page',
    },
);
</script>

<template>
    <div class="mv-not-implemented" :class="`mv-not-implemented--${size}`" role="status">
        <div class="mv-not-implemented__title">{{ title }}</div>
        <div v-if="message" class="mv-not-implemented__message">{{ message }}</div>
    </div>
</template>

<style scoped>
.mv-not-implemented {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    background: var(--app-surface, #fff);
    border: 1px dashed var(--app-nav-border, #dfe7e3);
    border-radius: var(--app-radius-lg, 16px);
}

.mv-not-implemented--page {
    padding: 56px 24px;
}

.mv-not-implemented--widget {
    padding: 24px 16px;
}

.mv-not-implemented__title {
    font-weight: 800;
    color: var(--app-nav-text-strong, #14231f);
}

.mv-not-implemented--page .mv-not-implemented__title {
    font-size: var(--app-font-size-title, 20px);
}

.mv-not-implemented--widget .mv-not-implemented__title {
    font-size: var(--app-font-size-body, 14px);
}

.mv-not-implemented__message {
    font-size: var(--app-font-size-body, 14px);
    color: var(--app-nav-label, #66736e);
}

.mv-not-implemented--widget .mv-not-implemented__message {
    font-size: 13px;
}
</style>
