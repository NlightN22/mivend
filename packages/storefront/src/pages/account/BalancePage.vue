<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate, formatMoney } from '../../i18n/format';
import AccountSidebar from './AccountSidebar.vue';
import {
    DEMO_CONTRACTS,
    DEMO_DUE,
    DEMO_LIMIT,
    DEMO_METRICS,
    DEMO_NEXT_PAYMENT,
    DEMO_PAYMENTS,
    DEMO_USED_PERCENT,
    type BalanceMetric,
} from './balanceDemo';

const { t } = useI18n();

const money = (amount: number): string => formatMoney(amount);
const shortDate = (iso: string): string =>
    formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
const days = (n: number): string => t('balance.days', n);

function metricValue(m: BalanceMetric): string {
    return m.days != null ? days(m.days) : money(m.amount ?? 0);
}

function metricNote(m: BalanceMetric): string {
    return t(`balance.metrics.${m.key}.note`, {
        percent: m.percent ?? 0,
        date: m.date ? shortDate(m.date) : '',
    });
}
</script>

<template>
    <div class="bal-page">
        <AccountSidebar />

        <section class="bal-content">
            <div class="bal-head">
                <div>
                    <h1 class="bal-title">{{ t('balance.title') }}</h1>
                    <p class="bal-subtitle">{{ t('balance.subtitle') }}</p>
                </div>
                <div class="bal-head-actions">
                    <button class="bal-btn">{{ t('balance.reconciliationAct') }}</button>
                    <button class="bal-btn bal-btn--primary">{{ t('balance.askQuestion') }}</button>
                </div>
            </div>

            <div class="bal-layout">
                <div class="bal-main">
                    <div class="bal-metrics">
                        <div
                            v-for="m in DEMO_METRICS"
                            :key="m.key"
                            class="bal-metric"
                            :class="{
                                'bal-metric--green': m.variant === 'green',
                                'bal-metric--orange': m.variant === 'orange',
                            }"
                        >
                            <div class="bal-metric__label">
                                {{ t(`balance.metrics.${m.key}.label`) }}
                            </div>
                            <div class="bal-metric__value">{{ metricValue(m) }}</div>
                            <div class="bal-metric__note">{{ metricNote(m) }}</div>
                        </div>
                    </div>

                    <div class="bal-notice">
                        <span>ℹ️</span>
                        <div>
                            <strong>{{ t('balance.notice.title') }}</strong>
                            {{ t('balance.notice.text') }}
                        </div>
                    </div>

                    <div class="bal-block">
                        <div class="bal-block__head">
                            <div>
                                <h2 class="bal-block__title">{{ t('balance.limit.title') }}</h2>
                                <div class="bal-block__sub">{{ t('balance.limit.sub') }}</div>
                            </div>
                            <span class="bal-pill">{{ t('balance.limit.ordersAvailable') }}</span>
                        </div>

                        <div class="bal-progress-wrap">
                            <div class="bal-progress-head">
                                <span>{{
                                    t('balance.limit.usedOf', {
                                        used: money(DEMO_LIMIT.used),
                                        total: money(DEMO_LIMIT.total),
                                    })
                                }}</span>
                                <span>{{ DEMO_USED_PERCENT }}%</span>
                            </div>
                            <div class="bal-progress">
                                <div
                                    class="bal-progress__fill"
                                    :style="{ width: `${DEMO_USED_PERCENT}%` }"
                                ></div>
                            </div>
                            <div class="bal-progress-foot">
                                <span>{{
                                    t('balance.limit.available', {
                                        amount: money(DEMO_LIMIT.available),
                                    })
                                }}</span>
                                <span>{{
                                    t('balance.limit.overdue', {
                                        amount: money(DEMO_LIMIT.overdue),
                                    })
                                }}</span>
                            </div>
                        </div>

                        <div class="bal-table">
                            <div v-for="c in DEMO_CONTRACTS" :key="c.key" class="bal-row">
                                <div class="bal-row__info">
                                    <div class="bal-row__title">
                                        {{ t(`balance.contracts.${c.key}.title`) }}
                                    </div>
                                    <div class="bal-row__note">
                                        {{ t(`balance.contracts.${c.key}.note`) }}
                                    </div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">
                                        {{ t('balance.cells.limit') }}
                                    </div>
                                    <div class="bal-cell__value">{{ money(c.limit) }}</div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">
                                        {{ t('balance.cells.available') }}
                                    </div>
                                    <div class="bal-cell__value">{{ money(c.available) }}</div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">
                                        {{ t('balance.cells.deferral') }}
                                    </div>
                                    <div class="bal-cell__value">{{ days(c.deferralDays) }}</div>
                                </div>
                                <span
                                    class="bal-pill"
                                    :class="{ 'bal-pill--warning': c.statusVariant === 'warning' }"
                                    >{{ t(`balance.status.${c.status}`) }}</span
                                >
                            </div>
                        </div>
                    </div>

                    <div class="bal-block">
                        <div class="bal-block__head">
                            <div>
                                <h2 class="bal-block__title">
                                    {{ t('balance.payments.title') }}
                                </h2>
                                <div class="bal-block__sub">{{ t('balance.payments.sub') }}</div>
                            </div>
                            <button class="bal-btn bal-btn--orange">
                                {{ t('balance.payments.pay') }}
                            </button>
                        </div>

                        <div class="bal-table">
                            <div v-for="p in DEMO_PAYMENTS" :key="p.order" class="bal-row">
                                <div class="bal-row__info">
                                    <div class="bal-row__title">
                                        {{ t('balance.payments.order', { number: p.order }) }}
                                    </div>
                                    <div class="bal-row__note">
                                        {{ t(`balance.payments.notes.${p.note}`) }}
                                    </div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">
                                        {{ t('balance.cells.amount') }}
                                    </div>
                                    <div class="bal-cell__value">{{ money(p.amount) }}</div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">
                                        {{ t('balance.cells.remaining') }}
                                    </div>
                                    <div class="bal-cell__value">{{ money(p.remaining) }}</div>
                                </div>
                                <div class="bal-cell">
                                    <div class="bal-cell__label">{{ t('balance.cells.due') }}</div>
                                    <div class="bal-cell__value">
                                        {{ p.due ? shortDate(p.due) : t('balance.status.paid') }}
                                    </div>
                                </div>
                                <span
                                    class="bal-pill"
                                    :class="{ 'bal-pill--warning': p.statusVariant === 'warning' }"
                                    >{{ t(`balance.status.${p.status}`) }}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>

                <aside class="bal-aside">
                    <div class="bal-panel">
                        <div class="bal-panel__title">{{ t('balance.pay.title') }}</div>
                        <div class="bal-panel__sub">{{ t('balance.pay.sub') }}</div>
                        <div class="bal-pay">
                            <div class="bal-pay__label">{{ t('balance.pay.amountDue') }}</div>
                            <input class="bal-pay__input" :value="money(DEMO_DUE)" />
                            <button class="bal-wide-btn">{{ t('balance.pay.proceed') }}</button>
                        </div>
                        <div class="bal-mini-list">
                            <div>
                                <div class="bal-mini-title">
                                    {{ t('balance.pay.advanceTitle') }}
                                </div>
                                <div class="bal-mini-note">{{ t('balance.pay.advanceNote') }}</div>
                            </div>
                            <div>
                                <div class="bal-mini-title">
                                    {{ t('balance.pay.documentsTitle') }}
                                </div>
                                <div class="bal-mini-note">
                                    {{ t('balance.pay.documentsNote') }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bal-panel">
                        <div class="bal-panel__title">{{ t('balance.next.title') }}</div>
                        <div class="bal-info-line">
                            <span>{{ t('balance.cells.amount') }}</span
                            ><strong>{{ money(DEMO_NEXT_PAYMENT.amount) }}</strong>
                        </div>
                        <div class="bal-info-line">
                            <span>{{ t('balance.next.dueDate') }}</span
                            ><strong>{{ shortDate(DEMO_NEXT_PAYMENT.date) }}</strong>
                        </div>
                        <div class="bal-info-line">
                            <span>{{ t('balance.next.order') }}</span
                            ><strong>#{{ DEMO_NEXT_PAYMENT.order }}</strong>
                        </div>
                        <div class="bal-info-line">
                            <span>{{ t('balance.next.overdue') }}</span
                            ><strong>{{ money(DEMO_LIMIT.overdue) }}</strong>
                        </div>
                        <button
                            class="bal-btn bal-btn--primary"
                            style="width: 100%; margin-top: 14px"
                        >
                            {{ t('balance.next.openOrder') }}
                        </button>
                    </div>

                    <div class="bal-panel">
                        <div class="bal-panel__title">{{ t('balance.restrictions.title') }}</div>
                        <div class="bal-panel__sub">{{ t('balance.restrictions.sub') }}</div>
                        <div class="bal-mini-list">
                            <div>
                                <div class="bal-mini-title">
                                    {{ t('balance.restrictions.nearlyTitle') }}
                                </div>
                                <div class="bal-mini-note">
                                    {{ t('balance.restrictions.nearlyNote') }}
                                </div>
                            </div>
                            <div>
                                <div class="bal-mini-title">
                                    {{ t('balance.restrictions.noOverdueTitle') }}
                                </div>
                                <div class="bal-mini-note">
                                    {{ t('balance.restrictions.noOverdueNote') }}
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped src="./BalancePage.css"></style>
<style scoped src="./BalancePanels.css"></style>
