<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useCurrency } from '../../composables/useCurrency';
import { formatTotals } from './balanceFormat';
import { contractAlmostExhausted, contractDebtTotals, type BalanceRow } from './balanceView';
import type { BalanceContract } from './useBalance';

defineProps<{
    used: number;
    total: number;
    available: number;
    percent: number;
    overdue: string;
    contracts: BalanceContract[];
    balances: BalanceRow[];
}>();

const { t } = useI18n();
const { formatCurrencyAmount } = useCurrency();
const dash = '—';
const days = (n: number | null | undefined): string => (n ? t('balance.days', n) : dash);
</script>

<template>
    <div class="bal-block">
        <div class="bal-block__head">
            <div>
                <h2 class="bal-block__title">{{ t('balance.limit.title') }}</h2>
                <div class="bal-block__sub">{{ t('balance.limit.sub') }}</div>
            </div>
        </div>

        <div class="bal-progress-wrap">
            <div class="bal-progress-head">
                <span>{{
                    t('balance.limit.usedOf', {
                        used: formatCurrencyAmount(used),
                        total: formatCurrencyAmount(total),
                    })
                }}</span>
                <span>{{ percent }}%</span>
            </div>
            <div class="bal-progress">
                <div class="bal-progress__fill" :style="{ width: `${percent}%` }"></div>
            </div>
            <div class="bal-progress-foot">
                <span>{{
                    t('balance.limit.available', { amount: formatCurrencyAmount(available) })
                }}</span>
                <span>{{ t('balance.limit.overdue', { amount: overdue }) }}</span>
            </div>
        </div>

        <div v-if="!contracts.length" class="bal-empty">{{ t('balance.limit.noContracts') }}</div>
        <div v-else class="bal-table">
            <div v-for="c in contracts" :key="c.id" class="bal-row bal-row--contract">
                <div class="bal-row__info">
                    <div class="bal-row__title">{{ c.name ?? t('balance.limit.unnamed') }}</div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.limit') }}</div>
                    <div class="bal-cell__value">
                        {{ c.creditLimit != null ? formatCurrencyAmount(c.creditLimit) : dash }}
                    </div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.debt') }}</div>
                    <div class="bal-cell__value">
                        {{ formatTotals(contractDebtTotals(c.id, balances)) }}
                    </div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.deferral') }}</div>
                    <div class="bal-cell__value">{{ days(c.paymentDelayDays) }}</div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.maxDebtDays') }}</div>
                    <div class="bal-cell__value">{{ days(c.debtDaysLimit) }}</div>
                </div>
                <span
                    v-if="contractAlmostExhausted(c, balances)"
                    class="bal-pill bal-pill--warning"
                    >{{ t('balance.status.nearlyUsed') }}</span
                >
                <span v-else class="bal-pill">{{ t('balance.status.active') }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped src="./BalancePanels.css"></style>
