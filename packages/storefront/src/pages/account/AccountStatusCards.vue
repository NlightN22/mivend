<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useCurrency } from '../../composables/useCurrency';

const props = defineProps<{
    activeOrders: number | null;
    inProcessingOrders: number | null;
    documentsThisMonth: { n: number; label: string } | null;
}>();

const authStore = useAuthStore();
const shown = (value: number | null): string => (value === null ? '—' : String(value));
const { formatCurrencyAmount } = useCurrency();

const availableLimit = computed(() => {
    const cp = authStore.counterparty;
    if (!cp) return '—';
    const val = cp.creditLimit - cp.creditBalance;
    return formatCurrencyAmount(val);
});

const delayDays = computed(() => authStore.counterparty?.paymentDelayDays ?? 0);
</script>

<template>
    <div class="status-cards">
        <div class="status-cards__card">
            <div class="status-cards__top">
                <div class="status-cards__title">{{ $t('account.status.activeOrders') }}</div>
                <div class="status-cards__icon">📦</div>
            </div>
            <div class="status-cards__value">{{ shown(props.activeOrders) }}</div>
            <div v-if="props.inProcessingOrders !== null" class="status-cards__note">
                {{ $t('account.status.inProcessing', { n: props.inProcessingOrders }) }}
            </div>
        </div>

        <div class="status-cards__card status-cards__card--blue">
            <div class="status-cards__top">
                <div class="status-cards__title">{{ $t('account.status.availableLimit') }}</div>
                <div class="status-cards__icon">₽</div>
            </div>
            <div class="status-cards__value">{{ availableLimit }}</div>
            <div v-if="delayDays > 0" class="status-cards__note">
                {{ $t('account.status.paymentDelay', delayDays) }}
            </div>
        </div>

        <div class="status-cards__card status-cards__card--warning">
            <div class="status-cards__top">
                <div class="status-cards__title">{{ $t('account.status.documents') }}</div>
                <div class="status-cards__icon">📄</div>
            </div>
            <div class="status-cards__value">
                {{ props.documentsThisMonth?.label ?? '—' }}
            </div>
            <div class="status-cards__note">{{ $t('account.status.newDocuments') }}</div>
        </div>
    </div>
</template>

<style scoped>
.status-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 22px;
}

.status-cards__card {
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 20px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    padding: 20px;
    min-height: 138px;
}

.status-cards__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
}

.status-cards__title {
    color: var(--app-nav-label);
    font-size: 14px;
    font-weight: 800;
}

.status-cards__icon {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-size: 21px;
    font-weight: 950;
}

.status-cards__card--blue .status-cards__icon {
    background: var(--app-slate-bg);
    color: var(--app-slate-fg);
}

.status-cards__card--warning .status-cards__icon {
    background: var(--app-orange-bg);
    color: var(--app-accent-orange-active);
}

.status-cards__value {
    font-size: 28px;
    font-weight: 950;
    letter-spacing: -0.05em;
    margin-bottom: 4px;
}

.status-cards__note {
    color: var(--app-nav-label);
    font-size: 13px;
    line-height: 1.35;
}

@media (max-width: 1240px) {
    .status-cards {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
