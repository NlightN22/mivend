<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { useCurrency } from '../../composables/useCurrency';

defineProps<{
    available: number;
    used: number;
    percent: number;
    deferralDays: number;
    due: string;
    nearestDue: string | null;
}>();

const { t } = useI18n();
const { formatCurrencyAmount } = useCurrency();
const shortDate = (iso: string): string =>
    formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
</script>

<template>
    <div class="bal-metrics">
        <div class="bal-metric bal-metric--green">
            <div class="bal-metric__label">{{ t('balance.metrics.available.label') }}</div>
            <div class="bal-metric__value">{{ formatCurrencyAmount(available) }}</div>
            <div class="bal-metric__note">{{ t('balance.metrics.available.note') }}</div>
        </div>
        <div class="bal-metric">
            <div class="bal-metric__label">{{ t('balance.metrics.used.label') }}</div>
            <div class="bal-metric__value">{{ formatCurrencyAmount(used) }}</div>
            <div class="bal-metric__note">{{ t('balance.metrics.used.note', { percent }) }}</div>
        </div>
        <div class="bal-metric">
            <div class="bal-metric__label">{{ t('balance.metrics.deferral.label') }}</div>
            <div class="bal-metric__value">{{ t('balance.days', deferralDays) }}</div>
            <div class="bal-metric__note">{{ t('balance.metrics.deferral.note') }}</div>
        </div>
        <div class="bal-metric bal-metric--orange">
            <div class="bal-metric__label">{{ t('balance.metrics.due.label') }}</div>
            <div class="bal-metric__value">{{ due }}</div>
            <div class="bal-metric__note">
                {{
                    nearestDue
                        ? t('balance.metrics.due.note', { date: shortDate(nearestDue) })
                        : t('balance.metrics.due.noDate')
                }}
            </div>
        </div>
    </div>
</template>

<style scoped src="./BalancePage.css"></style>
