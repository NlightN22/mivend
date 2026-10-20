<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { paymentStatusLabel, type SettlementRow } from '../settlements/useSettlementDocuments';
import { formatMinor } from './balanceFormat';
import { isOverdue, orderIdOf, owed } from './balanceView';

defineProps<{ rows: SettlementRow[]; total: number }>();

const { t } = useI18n();
const shortDate = (iso: string): string =>
    formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
const linkOf = (row: SettlementRow): string => {
    const orderId = orderIdOf(row);
    return orderId ? `/orders/${orderId}` : '/settlements';
};
</script>

<template>
    <div class="bal-block">
        <div class="bal-block__head">
            <div>
                <h2 class="bal-block__title">{{ t('balance.payments.title') }}</h2>
                <div class="bal-block__sub">{{ t('balance.payments.sub') }}</div>
            </div>
            <RouterLink to="/settlements" class="bal-link">{{
                t('balance.payments.statement')
            }}</RouterLink>
        </div>

        <div v-if="!rows.length" class="bal-empty">{{ t('balance.payments.empty') }}</div>
        <div v-else class="bal-table">
            <RouterLink v-for="p in rows" :key="p.id" :to="linkOf(p)" class="bal-row bal-row--link">
                <div class="bal-row__info">
                    <div class="bal-row__title">
                        {{
                            t('balance.payments.document', {
                                type: p.documentTypeLabel,
                                number: p.number,
                            })
                        }}
                    </div>
                    <div class="bal-row__note">
                        {{ t('balance.payments.fromDate', { date: shortDate(p.date) }) }}
                    </div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.amount') }}</div>
                    <div class="bal-cell__value">{{ formatMinor(p.amount, p.currency) }}</div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.remaining') }}</div>
                    <div class="bal-cell__value">{{ formatMinor(owed(p), p.currency) }}</div>
                </div>
                <div class="bal-cell">
                    <div class="bal-cell__label">{{ t('balance.cells.due') }}</div>
                    <div class="bal-cell__value">{{ p.dueDate ? shortDate(p.dueDate) : '—' }}</div>
                </div>
                <span v-if="isOverdue(p)" class="bal-pill bal-pill--danger">{{
                    t('balance.status.overdue')
                }}</span>
                <span v-else-if="p.paymentStatus" class="bal-pill bal-pill--warning">{{
                    paymentStatusLabel(p.paymentStatus)
                }}</span>
            </RouterLink>
        </div>
        <div v-if="total > rows.length" class="bal-block__sub bal-truncated">
            {{ t('balance.payments.truncated', { shown: rows.length, total }) }}
        </div>
    </div>
</template>

<style scoped src="./BalancePanels.css"></style>
