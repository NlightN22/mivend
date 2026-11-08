<script setup lang="ts">
import { formatWhen, type TimelineItem } from './approvalTimeline';

defineProps<{ items: TimelineItem[] }>();
</script>

<template>
    <ol class="approval-timeline" aria-label="Approval steps and decisions">
        <li
            v-for="item in items"
            :key="item.key"
            class="approval-timeline__item"
            :class="`approval-timeline__item--${item.state}`"
        >
            <span class="approval-timeline__dot" aria-hidden="true" />
            <div class="approval-timeline__body">
                <div class="approval-timeline__title">{{ item.title }}</div>
                <div v-if="item.meta || item.at" class="approval-timeline__meta">
                    <span v-if="item.meta">{{ item.meta }}</span>
                    <span v-if="item.at">{{ formatWhen(item.at) }}</span>
                </div>
                <blockquote v-if="item.comment" class="approval-timeline__comment">
                    {{ item.comment }}
                </blockquote>
            </div>
        </li>
    </ol>
</template>

<style scoped>
.approval-timeline {
    list-style: none;
    margin: 0;
    padding: 0;
}

.approval-timeline__item {
    position: relative;
    display: flex;
    gap: 12px;
    padding-bottom: 16px;
}

.approval-timeline__item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 16px;
    bottom: 0;
    width: 2px;
    background: var(--app-row-border);
}

.approval-timeline__dot {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 3px;
    border-radius: 50%;
    border: 2px solid var(--app-text-faint);
    background: var(--app-surface);
}

.approval-timeline__item--done .approval-timeline__dot {
    border-color: var(--app-ok-fg);
    background: var(--app-ok-bg);
}

.approval-timeline__item--rejected .approval-timeline__dot {
    border-color: var(--app-danger-fg);
    background: var(--app-danger-bg);
}

.approval-timeline__item--escalated .approval-timeline__dot,
.approval-timeline__item--current .approval-timeline__dot {
    border-color: var(--app-warn-fg);
    background: var(--app-warn-bg);
}

.approval-timeline__item--upcoming {
    opacity: 0.7;
}

.approval-timeline__title {
    font-weight: 700;
    color: var(--app-text-deep);
}

.approval-timeline__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    color: var(--app-text-grey);
}

.approval-timeline__comment {
    margin: 6px 0 0;
    padding: 6px 10px;
    border-left: 3px solid var(--app-row-border);
    background: var(--app-fill-faint);
    border-radius: var(--app-radius-sm);
    font-size: 14px;
    color: var(--app-text-body2);
    overflow-wrap: anywhere;
}
</style>
