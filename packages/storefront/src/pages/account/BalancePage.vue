<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvErrorState } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useDemoMode } from '../../composables/useDemoMode';
import { isLimitAlmostExhausted, usedPercent } from '../../utils/creditLimit';
import AccountSidebar from './AccountSidebar.vue';
import BalanceMetrics from './BalanceMetrics.vue';
import BalanceLimit from './BalanceLimit.vue';
import BalancePayments from './BalancePayments.vue';
import BalancePayPanel from './BalancePayPanel.vue';
import BalanceNextPayment from './BalanceNextPayment.vue';
import BalanceRestrictions from './BalanceRestrictions.vue';
import { formatTotals } from './balanceFormat';
import { dueTotals, nextPayment, overdueTotals, restrictions } from './balanceView';
import { useBalance } from './useBalance';

const { t } = useI18n();
const { demoAllowed } = useDemoMode();
const authStore = useAuthStore();
const { contracts, balances, unpaid, unpaidTotal, loading, failed, load } = useBalance();

const limit = computed(() => authStore.counterparty?.creditLimit ?? 0);
const used = computed(() => authStore.counterparty?.creditBalance ?? 0);
const available = computed(() => limit.value - used.value);
const percent = computed(() => usedPercent(used.value, limit.value));
const deferralDays = computed(() => authStore.counterparty?.paymentDelayDays ?? 0);
const overdue = computed(() => overdueTotals(balances.value));
const overdueText = computed(() => formatTotals(overdue.value));
const next = computed(() => nextPayment(unpaid.value));
const restrictionKeys = computed(() =>
    restrictions(overdue.value.length > 0, isLimitAlmostExhausted(used.value, limit.value)),
);

onMounted(load);
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
                <div v-if="demoAllowed" class="bal-head-actions">
                    <button class="bal-btn">{{ t('balance.reconciliationAct') }}</button>
                    <button class="bal-btn bal-btn--primary">{{ t('balance.askQuestion') }}</button>
                </div>
            </div>

            <div v-if="loading" class="bal-state">{{ t('common.loading') }}</div>
            <MvErrorState
                v-else-if="failed"
                :title="t('balance.loadError')"
                :retry-label="t('common.retry')"
                @retry="load"
            />
            <div v-else class="bal-layout">
                <div class="bal-main">
                    <BalanceMetrics
                        :available="available"
                        :used="used"
                        :percent="percent"
                        :deferral-days="deferralDays"
                        :due="formatTotals(dueTotals(unpaid))"
                        :nearest-due="next?.dueDate ?? null"
                    />

                    <div class="bal-notice">
                        <span>ℹ️</span>
                        <div>
                            <strong>{{ t('balance.notice.title') }}</strong>
                            {{
                                demoAllowed
                                    ? t('balance.notice.text')
                                    : t('balance.notice.textProd')
                            }}
                        </div>
                    </div>

                    <BalanceLimit
                        :used="used"
                        :total="limit"
                        :available="available"
                        :percent="percent"
                        :overdue="overdueText"
                        :contracts="contracts"
                        :balances="balances"
                    />
                    <BalancePayments :rows="unpaid" :total="unpaidTotal" />
                </div>

                <aside class="bal-aside">
                    <BalancePayPanel :contracts="contracts" :unpaid="unpaid" />
                    <BalanceNextPayment :next="next" />
                    <BalanceRestrictions :items="restrictionKeys" :overdue="overdueText" />
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped src="./BalancePage.css"></style>
