<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DemoRequest, RequestStatus } from './requestsDemo';

const props = defineProps<{ request: DemoRequest }>();
const { t } = useI18n();

const statusVariant: Record<RequestStatus, string> = {
    new: 'green',
    'in-progress': 'blue',
    awaiting: 'warning',
    resolved: 'green',
    closed: 'muted',
};

const text = (field: string): string => t(`requests.demo.r${props.request.id}.${field}`);
</script>

<template>
    <article class="req-card">
        <div class="req-card__head">
            <div>
                <div class="req-card__title">{{ text('title') }}</div>
                <div class="req-card__meta">{{ text('meta') }}</div>
            </div>
            <span
                class="req-card__status"
                :class="`req-card__status--${statusVariant[request.status]}`"
            >
                {{ t(`requests.status.${request.status}`) }}
            </span>
            <div class="req-card__meta">
                {{ t('requests.assignee') }}<br /><strong>{{
                    t(`requests.assignees.${request.assignee}`)
                }}</strong>
            </div>
        </div>

        <div class="req-card__body">
            <div class="req-card__preview">
                <div class="req-card__icon" :class="`req-card__icon--${request.iconVariant}`">
                    {{ request.icon }}
                </div>
                <div>{{ text('preview') }}</div>
            </div>

            <div v-if="request.hasMessage" class="req-card__message">
                <div class="req-card__msg-author">{{ text('author') }} · {{ text('time') }}</div>
                <div class="req-card__msg-text">{{ text('message') }}</div>
            </div>

            <div class="req-card__actions">
                <button
                    v-for="action in request.actions"
                    :key="action"
                    class="req-card__btn"
                    :class="{ 'req-card__btn--primary': action === 'open' }"
                >
                    {{ t(`requests.actions.${action}`) }}
                </button>
            </div>
        </div>
    </article>
</template>

<style scoped>
.req-card {
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    overflow: hidden;
}

.req-card__head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px 150px;
    gap: 14px;
    align-items: center;
    padding: 18px 20px;
    border-bottom: 1px solid var(--app-nav-border);
}

.req-card__title {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: -0.035em;
    margin-bottom: 5px;
}

.req-card__meta {
    color: var(--app-nav-label);
    font-size: 13px;
    line-height: 1.38;
}

.req-card__status {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.req-card__status--green {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}
.req-card__status--blue {
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}
.req-card__status--warning {
    background: var(--app-warn2-bg);
    color: var(--app-stock-low-fg);
}
.req-card__status--muted {
    background: var(--app-nav-border);
    color: var(--app-nav-label);
}

.req-card__body {
    padding: 16px 20px 18px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.req-card__preview {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: var(--app-nav-label);
    font-size: 14px;
    line-height: 1.45;
}

.req-card__icon {
    width: 46px;
    height: 46px;
    border-radius: 15px;
    display: grid;
    place-items: center;
    font-size: 22px;
    font-weight: 950;
    flex-shrink: 0;
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}

.req-card__icon--green {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}
.req-card__icon--orange {
    background: var(--app-warn2-bg);
    color: var(--app-stock-low-fg);
}
.req-card__icon--blue {
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}

.req-card__message {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--app-fill-faint);
    border: 1px solid var(--app-nav-border);
}

.req-card__msg-author {
    font-weight: 950;
    font-size: 13px;
    color: var(--app-nav-accent);
}

.req-card__msg-text {
    color: var(--app-text-body3);
    font-size: 13px;
    line-height: 1.42;
}

.req-card__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.req-card__btn {
    border: 0;
    min-height: 40px;
    border-radius: 12px;
    padding: 0 14px;
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    font: inherit;
    font-weight: 950;
    cursor: pointer;
    white-space: nowrap;
}

.req-card__btn--primary {
    background: var(--app-brand-fill);
    color: var(--app-on-accent);
}

@media (max-width: 960px) {
    .req-card__head {
        grid-template-columns: minmax(0, 1fr);
    }
    .req-card__actions {
        justify-content: flex-start;
    }
}
</style>
