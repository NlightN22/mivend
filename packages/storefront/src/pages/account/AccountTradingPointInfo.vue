<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useCurrency } from '../../composables/useCurrency';
import { useDemoMode } from '../../composables/useDemoMode';
import { isLimitAlmostExhausted } from '../../utils/creditLimit';

const { demoAllowed } = useDemoMode();
const authStore = useAuthStore();
const { formatCurrencyAmount } = useCurrency();
const tradingPoint = computed(() => authStore.tradingPoint);
const counterparty = computed(() => authStore.counterparty);

const limitWarning = computed(() => {
    const cp = counterparty.value;
    return !!cp && isLimitAlmostExhausted(cp.creditBalance, cp.creditLimit);
});
</script>

<template>
    <div class="trading-point-info">
        <div class="trading-point-info__header">
            <div>
                <h2 class="trading-point-info__title">{{ $t('account.currentPoint.title') }}</h2>
                <div class="trading-point-info__subtitle">
                    {{ $t('account.currentPoint.subtitle') }}
                </div>
            </div>
            <RouterLink to="/account/trading-points" class="trading-point-info__link-more">{{
                $t('account.currentPoint.change')
            }}</RouterLink>
        </div>

        <div class="trading-point-info__list">
            <div v-if="tradingPoint" class="trading-point-info__row">
                <div>
                    <div class="trading-point-info__row-title">{{ tradingPoint.address }}</div>
                    <div class="trading-point-info__row-note">
                        {{ tradingPoint.name }}
                    </div>
                </div>
            </div>
            <div v-if="counterparty" class="trading-point-info__row">
                <div>
                    <div class="trading-point-info__row-title">
                        {{
                            demoAllowed
                                ? $t('account.currentPoint.contract', { number: 'B2B-014' })
                                : $t('account.currentPoint.terms')
                        }}
                    </div>
                    <div class="trading-point-info__row-note">
                        {{
                            counterparty.paymentDelayDays > 0
                                ? $t(
                                      'account.currentPoint.deferredLimit',
                                      {
                                          n: counterparty.paymentDelayDays,
                                          amount: formatCurrencyAmount(counterparty.creditLimit),
                                      },
                                      counterparty.paymentDelayDays,
                                  )
                                : $t('account.currentPoint.limit', {
                                      amount: formatCurrencyAmount(counterparty.creditLimit),
                                  })
                        }}
                    </div>
                </div>
            </div>
        </div>

        <div v-if="limitWarning" class="trading-point-info__notice">
            <div>⚠️</div>
            <div>
                <strong>{{ $t('account.currentPoint.almostReached') }}</strong>
                {{ $t('account.currentPoint.noticeText') }}
            </div>
        </div>
        <div v-else class="trading-point-info__notice">
            <div>⚠️</div>
            <div>
                <strong>{{ $t('account.currentPoint.notice') }}</strong>
                {{ $t('account.currentPoint.noticeText') }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.trading-point-info {
    background: var(--app-surface);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    border: 1px solid var(--app-border-glass);
    padding: 22px;
}

.trading-point-info__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.trading-point-info__title {
    margin: 0 0 5px;
    font-size: 26px;
    letter-spacing: -0.045em;
}

.trading-point-info__subtitle {
    color: var(--app-nav-label);
    font-size: 14px;
    line-height: 1.45;
}

.trading-point-info__link-more {
    color: var(--app-nav-accent);
    font-weight: 950;
    font-size: 14px;
    white-space: nowrap;
    text-decoration: none;
}

.trading-point-info__list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
}

.trading-point-info__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 58px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--app-nav-border);
    background: var(--app-fill-faint);
}

.trading-point-info__row-title {
    font-weight: 900;
    margin-bottom: 3px;
}

.trading-point-info__row-note {
    color: var(--app-nav-label);
    font-size: 13px;
    line-height: 1.3;
}

.trading-point-info__notice {
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid var(--app-orange-glow);
    background: var(--app-orange-bg);
    display: flex;
    gap: 12px;
    align-items: flex-start;
    color: var(--app-warn2-fg);
    margin-top: 14px;
    font-size: 14px;
    line-height: 1.42;
}

.trading-point-info__notice strong {
    display: block;
    color: var(--app-lime-fg);
    margin-bottom: 2px;
}
</style>
