<script setup lang="ts">
import type { ActivityItem } from '../../api/dashboard';

defineProps<{ items: ActivityItem[] }>();

function timeAgo(at: string): string {
    const diffMs = Date.now() - new Date(at).getTime();
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(at).toLocaleDateString('en-US');
}
</script>

<template>
    <ul class="activity-feed">
        <li v-if="!items.length" class="activity-feed__empty">No recent activity</li>
        <li v-for="item in items" :key="item.id" class="activity-feed__item">
            <span class="activity-feed__dot" />
            <div class="activity-feed__body">
                <span>{{ item.text }}</span>
                <span class="activity-feed__time">{{ timeAgo(item.at) }}</span>
            </div>
        </li>
    </ul>
</template>

<style scoped>
.activity-feed {
    list-style: none;
    margin: 0;
    padding: 0;
}

.activity-feed__item {
    display: grid;
    grid-template-columns: 10px 1fr;
    gap: 10px;
    padding-top: 14px;
}

.activity-feed__item:first-child {
    padding-top: 0;
}

.activity-feed__dot {
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--el-color-primary, #00b894);
    box-shadow: 0 0 0 4px var(--el-color-primary-light-9, #f0fffa);
}

.activity-feed__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    line-height: 1.4;
}

.activity-feed__time {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.activity-feed__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
