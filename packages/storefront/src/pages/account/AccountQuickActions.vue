<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useCurrency } from '../../composables/useCurrency';
import { useDemoMode } from '../../composables/useDemoMode';

const props = defineProps<{ documentsThisMonth: { n: number; label: string } | null }>();

const { t } = useI18n();
const { demoAllowed } = useDemoMode();
const documentsText = computed(() => {
    const value = props.documentsThisMonth;
    return value ? t('account.attention.newDocumentsText', { n: value.label }, value.n) : '—';
});
const authStore = useAuthStore();
const { formatCurrencyAmount } = useCurrency();

const limitText = computed(() => {
    const cp = authStore.counterparty;
    if (!cp) return t('account.attention.noLimitData');
    const amount = formatCurrencyAmount(cp.creditLimit - cp.creditBalance);
    const n = cp.paymentDelayDays;
    return n > 0
        ? t('account.attention.availableDeferred', { amount, n }, n)
        : t('account.attention.available', { amount });
});
</script>

<template>
    <div class="quick-actions">
        <div class="quick-actions__header">
            <div>
                <h2 class="quick-actions__title">{{ $t('account.attention.title') }}</h2>
                <div class="quick-actions__subtitle">
                    {{ $t('account.attention.subtitle') }}
                </div>
            </div>
        </div>

        <div class="quick-actions__grid" :class="{ 'quick-actions__grid--two': !demoAllowed }">
            <RouterLink to="/documents" class="quick-actions__card">
                <div>
                    <div class="quick-actions__icon">📄</div>
                    <div class="quick-actions__card-title">
                        {{ $t('account.attention.newDocuments') }}
                    </div>
                    <div class="quick-actions__card-text">
                        {{ documentsText }}
                    </div>
                </div>
            </RouterLink>
            <RouterLink to="/account/balance" class="quick-actions__card">
                <div>
                    <div class="quick-actions__icon">₽</div>
                    <div class="quick-actions__card-title">{{ $t('account.attention.limit') }}</div>
                    <div class="quick-actions__card-text">{{ limitText }}</div>
                </div>
            </RouterLink>
            <RouterLink v-if="demoAllowed" to="/requests" class="quick-actions__card">
                <div>
                    <div class="quick-actions__icon">💬</div>
                    <div class="quick-actions__card-title">
                        {{ $t('account.attention.openRequests') }}
                    </div>
                    <div class="quick-actions__card-text">
                        {{ $t('account.attention.openRequestsText', 2) }}
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>

<style scoped>
.quick-actions {
    background: var(--app-surface);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    border: 1px solid var(--app-border-glass);
    padding: 22px;
    margin-bottom: 22px;
}

.quick-actions__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.quick-actions__title {
    margin: 0 0 5px;
    font-size: 26px;
    letter-spacing: -0.045em;
}

.quick-actions__subtitle {
    color: var(--app-nav-label);
    font-size: 14px;
    line-height: 1.45;
}

.quick-actions__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.quick-actions__card {
    min-height: 128px;
    border: 1px solid var(--app-nav-border);
    border-radius: 20px;
    padding: 18px;
    background: var(--app-fill-faint);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: space-between;
    text-decoration: none;
    color: inherit;
    transition: 0.16s ease;
}

.quick-actions__card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px var(--app-ink-08);
}

.quick-actions__icon {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font-size: 20px;
    font-weight: 950;
    margin-bottom: 12px;
}

.quick-actions__card-title {
    font-weight: 950;
    letter-spacing: -0.025em;
    margin-bottom: 5px;
}

.quick-actions__card-text {
    color: var(--app-nav-label);
    font-size: 13px;
    line-height: 1.35;
}

.quick-actions__grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 1240px) {
    .quick-actions__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 620px) {
    .quick-actions__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
