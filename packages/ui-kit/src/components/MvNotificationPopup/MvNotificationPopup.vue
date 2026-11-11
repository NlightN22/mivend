<script setup lang="ts">
import type { NotificationKind } from '../../composables/notificationTypes';

withDefaults(
    defineProps<{
        message: string;
        title?: string;
        kind?: NotificationKind;
        persisted?: boolean;
    }>(),
    { title: '', kind: 'info', persisted: false },
);

defineEmits<{ dismiss: [] }>();
</script>

<template>
    <div
        :class="['mv-notification-popup', `mv-notification-popup--${kind}`]"
        :data-persisted="persisted"
        role="status"
    >
        <span class="mv-notification-popup__text">
            <strong v-if="title" class="mv-notification-popup__title">{{ title }}</strong>
            <span class="mv-notification-popup__message">{{ message }}</span>
        </span>
        <button
            class="mv-notification-popup__close"
            type="button"
            aria-label="Dismiss"
            @click="$emit('dismiss')"
        >
            ×
        </button>
    </div>
</template>

<style scoped>
.mv-notification-popup {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 14px;
    border-radius: 18px;
    border: 1px solid transparent;
    font-size: 13px;
    line-height: 1.45;
    box-shadow: 0 14px 36px var(--app-ink-14);
    min-width: 240px;
    max-width: 360px;
}

.mv-notification-popup--info {
    background: var(--app-nav-active-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok2-fg);
}

.mv-notification-popup--success {
    background: var(--app-ok-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok-fg);
}

.mv-notification-popup--warning {
    background: var(--app-warn2-bg);
    border-color: var(--app-orange-glow);
    color: var(--app-warn2-fg);
}

.mv-notification-popup--error {
    background: var(--app-danger2-bg);
    border-color: var(--app-danger-glow);
    color: var(--app-danger2-fg);
}

.mv-notification-popup__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
}

.mv-notification-popup__title {
    font-weight: 700;
}

.mv-notification-popup__close {
    border: none;
    background: transparent;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    flex-shrink: 0;
}
.mv-notification-popup__close:hover {
    opacity: 1;
}
</style>
