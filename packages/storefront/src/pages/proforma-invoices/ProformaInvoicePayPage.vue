<script setup lang="ts">
import { formatMoney } from './formatMoney';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useProformaInvoiceDetail } from './useProformaInvoiceDetail';
import { usePayProformaInvoice, type PayProformaInvoiceOutcome } from './usePayProformaInvoice';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const proformaInvoiceId = route.params.id as string;

const { proformaInvoice, loading: loadingProformaInvoice, load } = useProformaInvoiceDetail();
const { loading: paying, payProformaInvoice } = usePayProformaInvoice();

onMounted(() => {
    void load(proformaInvoiceId);
});

const formatAmount = formatMoney;

async function choose(outcome: PayProformaInvoiceOutcome): Promise<void> {
    await payProformaInvoice(proformaInvoiceId, outcome);
    void router.push(`/proforma-invoices/${proformaInvoiceId}`);
}
</script>

<template>
    <div class="stub-page">
        <div class="stub-card">
            <div class="stub-lock">🔒</div>
            <h1 class="stub-title">{{ t('proformaInvoices.pay.title') }}</h1>
            <p class="stub-subtitle">{{ t('proformaInvoices.pay.subtitle') }}</p>

            <div class="stub-warning">⚠️ {{ t('proformaInvoices.pay.warning') }}</div>

            <div v-if="loadingProformaInvoice" class="stub-order">{{ t('common.loading') }}</div>
            <div v-else-if="proformaInvoice" class="stub-order">
                {{ t('proformaInvoices.title', { number: proformaInvoice.number }) }} ·
                {{ formatAmount(proformaInvoice.amount, proformaInvoice.currencyCode) }}
            </div>

            <div class="stub-actions">
                <button
                    class="stub-btn stub-btn--green"
                    :disabled="paying"
                    @click="choose('success')"
                >
                    ✓ {{ t('proformaInvoices.pay.success') }}
                </button>
                <button
                    class="stub-btn stub-btn--orange"
                    :disabled="paying"
                    @click="choose('pending')"
                >
                    ⏳ {{ t('proformaInvoices.pay.pending') }}
                </button>
                <button class="stub-btn stub-btn--red" :disabled="paying" @click="choose('fail')">
                    ✕ {{ t('proformaInvoices.pay.fail') }}
                </button>
            </div>

            <RouterLink :to="`/proforma-invoices/${proformaInvoiceId}`" class="stub-back"
                >← {{ t('proformaInvoices.pay.back') }}</RouterLink
            >
        </div>
    </div>
</template>

<style scoped>
.stub-page {
    min-height: 100vh;
    background: var(--app-fill-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}

.stub-card {
    width: 100%;
    max-width: 480px;
    background: var(--app-surface);
    border-radius: 24px;
    padding: 36px 32px 28px;
    box-shadow: 0 14px 36px var(--app-ink-10);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.stub-lock {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--app-nav-active-bg);
    display: grid;
    place-items: center;
    font-size: 28px;
    margin-bottom: 14px;
}

.stub-title {
    margin: 0 0 6px;
    font-size: 28px;
    font-weight: 950;
    letter-spacing: -0.045em;
}

.stub-subtitle {
    margin: 0 0 20px;
    color: var(--app-nav-label);
    font-size: 14px;
}

.stub-warning {
    width: 100%;
    background: var(--app-warn2-bg);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 14px;
    padding: 12px 14px;
    font-size: 13px;
    color: var(--app-orange-fg);
    margin-bottom: 18px;
    text-align: left;
}

.stub-order {
    font-size: 15px;
    font-weight: 800;
    color: var(--app-text-deep);
    background: var(--el-bg-color-page);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 12px;
    padding: 10px 18px;
    margin-bottom: 22px;
    width: 100%;
}

.stub-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    width: 100%;
    margin-bottom: 18px;
}

.stub-btn {
    width: 100%;
    min-height: 52px;
    border: 0;
    border-radius: 16px;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    color: var(--app-on-accent);
    cursor: pointer;
    transition: opacity 0.15s;
}
.stub-btn:hover {
    opacity: 0.88;
}
.stub-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.stub-btn--green {
    background: var(--app-brand-fill);
    box-shadow: 0 8px 20px var(--app-green-glow);
}
.stub-btn--orange {
    background: var(--app-accent-orange);
    box-shadow: 0 8px 20px var(--app-orange-glow);
}
.stub-btn--orange:hover:not(:disabled) {
    background: var(--app-accent-orange-hover);
}
.stub-btn--orange:active:not(:disabled) {
    background: var(--app-accent-orange-active);
}
.stub-btn--red {
    background: var(--app-danger-btn-hover);
    box-shadow: 0 8px 20px var(--app-danger-glow);
}

.stub-back {
    font-size: 13px;
    color: var(--app-nav-label);
    text-decoration: none;
    font-weight: 700;
}
.stub-back:hover {
    color: var(--app-text-deep);
}
</style>
