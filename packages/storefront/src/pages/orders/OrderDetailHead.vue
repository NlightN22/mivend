<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvCopyButton, formatDocumentNumber } from '@mivend/ui-kit';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import { formatDate } from './orderFormat';
import { useStatusGroupLabel } from './useStatusGroupLabel';

const props = defineProps<{
    title: string;
    createdAt: string;
    code: string;
    statusCode: string | null | undefined;
}>();
const { t } = useI18n();
const statuses = useOrderStatusesStore();
const statusLabel = useStatusGroupLabel(() => props.statusCode);
const pageUrl = (): string => window.location.href;
</script>

<template>
    <div class="od-head">
        <div>
            <h1 class="od-title">{{ title }}</h1>
            <div class="od-meta-row">
                <span class="od-meta">{{ formatDate(createdAt) }}</span>
                <MvCopyButton
                    :value="formatDocumentNumber(code)"
                    :label="t('orders.detail.copyNumber')"
                />
                <MvCopyButton :value="pageUrl" icon="share" :label="t('orders.detail.copyLink')" />
            </div>
        </div>
        <div class="od-head-side">
            <span
                class="od-status"
                :class="statuses.variant(statusCode)"
                :title="statuses.label(statusCode)"
            >
                {{ statusLabel }}
            </span>
        </div>
    </div>
</template>

<style scoped>
.od-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}

.od-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.od-head-side {
    display: flex;
    align-items: center;
    gap: 8px;
}

.od-title {
    margin: 0 0 4px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 950;
    letter-spacing: -0.045em;
}

.od-meta {
    color: var(--app-nav-label);
    font-size: 13px;
}

.od-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
}

.od-status.muted {
    background: var(--app-nav-border);
    color: var(--app-nav-label);
}

.od-status.warning {
    background: var(--app-orange-bg);
    color: var(--app-orange-fg);
}

.od-status.error {
    background: var(--app-danger2-bg);
    color: var(--app-orange-fg);
}

@media (max-width: 760px) {
    .od-head {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
