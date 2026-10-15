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
    color: #66736e;
    font-size: 13px;
}

.od-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    background: #e2f8ef;
    color: #008a64;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
}

.od-status.muted {
    background: #eef4f1;
    color: #5f6e68;
}

.od-status.warning {
    background: #fff4e3;
    color: #a45e00;
}

.od-status.error {
    background: #ffeeed;
    color: #c0362c;
}

@media (max-width: 760px) {
    .od-head {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
