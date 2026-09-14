<script setup lang="ts">
import { ref } from 'vue';
import { IconCheck, IconX } from '@tabler/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvInput from '../MvInput/MvInput.vue';
import type { NoticeVariant } from '../MvNotice/MvNotice.vue';
import type { NotificationItem, NotificationKind } from '../../composables/notificationTypes';

withDefaults(defineProps<{ notifications: NotificationItem[]; loading?: boolean }>(), {
    loading: false,
});

const emit = defineEmits<{
    markRead: [id: string];
    resolve: [id: string, resolution: string];
    close: [];
    // issue #92: navigates to the portal's own full notifications page — this panel only ever
    // shows the most recent handful (see useNotifications' PANEL_TAKE), never paginates itself.
    viewAll: [];
}>();

// NotificationKind maps 1:1 onto MvNotice's NoticeVariant — same four names, no new palette.
const KIND_VARIANT: Record<NotificationKind, NoticeVariant> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'error',
};

const resolvingId = ref<string | null>(null);
const resolutionDraft = ref('');

function startResolve(id: string): void {
    resolvingId.value = id;
    resolutionDraft.value = '';
}

function cancelResolve(): void {
    resolvingId.value = null;
    resolutionDraft.value = '';
}

function confirmResolve(id: string): void {
    if (!resolutionDraft.value.trim()) {
        return;
    }
    emit('resolve', id, resolutionDraft.value.trim());
    cancelResolve();
}

function formatRelativeTime(value: string): string {
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
}
</script>

<template>
    <div class="mv-notification-panel">
        <div class="mv-notification-panel__header">
            <h3 class="mv-notification-panel__title">Notifications</h3>
            <button
                type="button"
                class="mv-notification-panel__close"
                aria-label="Close"
                @click="$emit('close')"
            >
                <IconX :size="16" />
            </button>
        </div>

        <div v-if="loading" class="mv-notification-panel__empty">Loading…</div>
        <div v-else-if="notifications.length === 0" class="mv-notification-panel__empty">
            No notifications
        </div>

        <ul v-else class="mv-notification-panel__list">
            <li
                v-for="item in notifications"
                :key="item.id"
                class="mv-notification-panel__row"
                :class="{ 'mv-notification-panel__row--unread': item.status === 'unread' }"
            >
                <span
                    class="mv-notification-panel__indicator"
                    :class="`mv-notification-panel__indicator--${KIND_VARIANT[item.kind]}`"
                />
                <div class="mv-notification-panel__body">
                    <div class="mv-notification-panel__row-header">
                        <span class="mv-notification-panel__row-title">{{ item.title }}</span>
                        <span class="mv-notification-panel__row-time">
                            {{ formatRelativeTime(item.createdAt) }}
                        </span>
                    </div>
                    <p class="mv-notification-panel__row-message">{{ item.message }}</p>

                    <div class="mv-notification-panel__row-actions">
                        <button
                            v-if="item.status === 'unread'"
                            type="button"
                            class="mv-notification-panel__link"
                            @click="$emit('markRead', item.id)"
                        >
                            Mark read
                        </button>
                        <button
                            v-if="item.status !== 'resolved' && resolvingId !== item.id"
                            type="button"
                            class="mv-notification-panel__link"
                            @click="startResolve(item.id)"
                        >
                            Resolve
                        </button>
                    </div>

                    <div
                        v-if="item.status !== 'resolved' && resolvingId === item.id"
                        class="mv-notification-panel__resolve-form"
                    >
                        <MvInput
                            v-model="resolutionDraft"
                            placeholder="Resolution note"
                            size="sm"
                            @keyup.enter="confirmResolve(item.id)"
                        />
                        <MvButton
                            variant="ghost"
                            size="sm"
                            :disabled="!resolutionDraft.trim()"
                            @click="confirmResolve(item.id)"
                        >
                            <IconCheck :size="16" />
                        </MvButton>
                        <MvButton variant="ghost" size="sm" @click="cancelResolve">
                            <IconX :size="16" />
                        </MvButton>
                    </div>
                </div>
            </li>
        </ul>

        <div v-if="!loading && notifications.length > 0" class="mv-notification-panel__footer">
            <button
                type="button"
                class="mv-notification-panel__view-all"
                @click="$emit('viewAll')"
            >
                Show all notifications
            </button>
        </div>
    </div>
</template>

<style scoped>
.mv-notification-panel {
    width: 360px;
    max-width: calc(100vw - 32px);
    max-height: 480px;
    display: flex;
    flex-direction: column;
    background: var(--app-surface, #fff);
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 16px);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.14);
    overflow: hidden;
}

.mv-notification-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.mv-notification-panel__title {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: var(--el-text-color-primary, #17212b);
}

.mv-notification-panel__close {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--el-text-color-secondary, #6b7280);
    display: grid;
    place-items: center;
}

.mv-notification-panel__empty {
    padding: 24px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.mv-notification-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
}

.mv-notification-panel__row {
    display: flex;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter, #f0f2f5);
}

.mv-notification-panel__row--unread {
    background: #f5fbf9;
}

.mv-notification-panel__indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 6px;
}

.mv-notification-panel__indicator--info { background: #00a878; }
.mv-notification-panel__indicator--success { background: #10b981; }
.mv-notification-panel__indicator--warning { background: #ff8a00; }
.mv-notification-panel__indicator--error { background: #ef4444; }

.mv-notification-panel__body {
    flex: 1;
    min-width: 0;
}

.mv-notification-panel__row-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}

.mv-notification-panel__row-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-notification-panel__row-time {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--el-text-color-secondary, #98a2b3);
}

.mv-notification-panel__row-message {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    line-height: 1.4;
}

.mv-notification-panel__row-actions {
    display: flex;
    gap: 12px;
    margin-top: 6px;
}

.mv-notification-panel__link {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2, #008a70);
}

.mv-notification-panel__resolve-form {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
}

.mv-notification-panel__resolve-form :deep(.mv-input) {
    flex: 1;
}

.mv-notification-panel__footer {
    border-top: 1px solid var(--el-border-color, #e4e7ec);
    padding: 10px 16px;
    text-align: center;
    flex-shrink: 0;
}

.mv-notification-panel__view-all {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2, #008a70);
}
</style>
