<script setup lang="ts">
import { IconBell } from '@tabler/icons-vue';
import MvCountBadge from '../MvCountBadge/MvCountBadge.vue';

defineProps<{ unreadCount: number }>();

defineEmits<{ click: [] }>();
</script>

<template>
    <button
        type="button"
        class="mv-notification-bell"
        aria-label="Notifications"
        @click="$emit('click')"
    >
        <IconBell :size="20" stroke-width="1.75" />
        <span class="mv-notification-bell__badge"><MvCountBadge :count="unreadCount" /></span>
    </button>
</template>

<style scoped>
.mv-notification-bell {
    position: relative;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    background: var(--app-surface, #fff);
    color: var(--el-text-color-primary, #17212b);
    cursor: pointer;
    transition: background 0.14s, color 0.14s;
}

.mv-notification-bell:hover {
    background: #e2f8ef;
    color: #008a64;
}

.mv-notification-bell__badge {
    position: absolute;
    top: -4px;
    right: -4px;
    line-height: 0;
}

.mv-notification-bell__badge :deep(.mv-count-badge) {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: 10px;
}
</style>
