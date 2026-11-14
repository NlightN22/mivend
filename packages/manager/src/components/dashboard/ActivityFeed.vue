<script setup lang="ts">
import { computed } from 'vue';
import { MvBlockError } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import { tr } from '../../utils/lazyLabels';
import { formatDate } from '../../i18n/format';
import type { ActivityItem } from '../../api/dashboard';

// A failed orders or approvals read hides the whole feed: a partial list would pass for a real one.
const props = defineProps<{
    items: ActivityItem[];
    failed?: { orders?: string; approvals?: string };
}>();

const failureReason = computed(() => {
    const reasons = [props.failed?.orders, props.failed?.approvals].filter(
        (reason): reason is string => Boolean(reason),
    );
    return reasons.length ? [...new Set(reasons)].join('; ') : null;
});
const blockFailedTitle = (): string => i18n.global.t('common.blockLoadFailed');

function timeAgo(at: string): string {
    const diffMs = Date.now() - new Date(at).getTime();
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 1) return tr('dashboardParts.activity.justNow');
    if (minutes < 60) return tr('dashboardParts.activity.minutesAgo', { count: minutes }, minutes);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return tr('dashboardParts.activity.hoursAgo', { count: hours }, hours);
    return formatDate(at);
}
</script>

<template>
    <MvBlockError v-if="failureReason" :title="blockFailedTitle()" :message="failureReason" />
    <ul v-else class="activity-feed">
        <li v-if="!items.length" class="activity-feed__empty">
            {{ tr('dashboardParts.activity.empty') }}
        </li>
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
    background: var(--el-color-primary);
    box-shadow: 0 0 0 4px var(--el-color-primary-light-9);
}

.activity-feed__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    line-height: 1.4;
}

.activity-feed__time {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.activity-feed__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
