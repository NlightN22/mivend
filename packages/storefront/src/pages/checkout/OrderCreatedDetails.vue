<script setup lang="ts">
import { formatDocumentNumber } from '@mivend/ui-kit';

defineProps<{
    code: string;
    placedAt: string | null;
    tradingPoint: string | null;
    paymentLabel: string;
    delivery: string | null;
    steps: string[];
}>();
</script>

<template>
    <div class="oc-details-grid">
        <div class="oc-card">
            <h3 class="oc-card-title">{{ $t('orderCreated.details') }}</h3>
            <div class="oc-detail-list">
                <div class="oc-detail">
                    <span>{{ $t('orderCreated.orderNumber') }}</span
                    ><strong>{{ formatDocumentNumber(code) }}</strong>
                </div>
                <div v-if="placedAt" class="oc-detail">
                    <span>{{ $t('orders.date') }}</span
                    ><strong>{{ placedAt }}</strong>
                </div>
                <div v-if="tradingPoint" class="oc-detail">
                    <span>{{ $t('header.tradingPoint') }}</span
                    ><strong>{{ tradingPoint }}</strong>
                </div>
                <div class="oc-detail">
                    <span>{{ $t('payment.title') }}</span
                    ><strong>{{ paymentLabel }}</strong>
                </div>
                <div v-if="delivery" class="oc-detail">
                    <span>{{ $t('delivery.title') }}</span
                    ><strong>{{ delivery }}</strong>
                </div>
            </div>
        </div>

        <div class="oc-card">
            <h3 class="oc-card-title">{{ $t('orderCreated.next') }}</h3>
            <ol class="oc-steps">
                <li v-for="(step, i) in steps" :key="i" class="oc-step">
                    <span class="oc-step-num">{{ i + 1 }}</span>
                    <span>{{ step }}</span>
                </li>
            </ol>
        </div>
    </div>
</template>

<style scoped>
.oc-details-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    max-width: 900px;
    margin: 0 auto;
}

.oc-card {
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 24px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    padding: 22px;
}

.oc-card-title {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.oc-detail-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
}

.oc-detail {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: var(--app-nav-label);
    padding-bottom: 10px;
    border-bottom: 1px solid var(--app-nav-border);
}

.oc-detail:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.oc-detail strong {
    color: var(--app-nav-text-strong);
    font-weight: 700;
    text-align: right;
}

.oc-steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.oc-step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 14px;
    color: var(--app-text-deep);
    line-height: 1.4;
}

.oc-step-num {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-size: 13px;
    font-weight: 900;
    display: grid;
    place-items: center;
}

@media (max-width: 760px) {
    .oc-details-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
