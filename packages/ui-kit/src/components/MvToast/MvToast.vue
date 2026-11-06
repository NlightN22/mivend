<script setup lang="ts">
import type { NoticeVariant } from '../MvNotice/MvNotice.vue';

withDefaults(defineProps<{ message: string; variant?: NoticeVariant }>(), {
    variant: 'info',
});

defineEmits<{ dismiss: [] }>();
</script>

<template>
    <div :class="['mv-toast', `mv-toast--${variant}`]" role="status">
        <span class="mv-toast__message">{{ message }}</span>
        <button
            class="mv-toast__close"
            type="button"
            aria-label="Dismiss"
            @click="$emit('dismiss')"
        >
            ×
        </button>
    </div>
</template>

<style scoped>
.mv-toast {
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

.mv-toast--info {
    background: var(--app-nav-active-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok2-fg);
}

.mv-toast--success {
    background: var(--app-ok-bg);
    border-color: var(--app-green-glow);
    color: var(--app-ok-fg);
}

.mv-toast--warning {
    background: var(--app-warn2-bg);
    border-color: var(--app-orange-glow);
    color: var(--app-warn2-fg);
}

.mv-toast--error {
    background: var(--app-danger2-bg);
    border-color: var(--app-danger-glow);
    color: var(--app-danger2-fg);
}

.mv-toast__message {
    flex: 1;
}

.mv-toast__close {
    border: none;
    background: transparent;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    flex-shrink: 0;
}
.mv-toast__close:hover {
    opacity: 1;
}
</style>
