<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import type { SettlementRow } from '../settlements/useSettlementDocuments';
import { formatMinor } from './balanceFormat';
import { orderIdOf, owed } from './balanceView';

const props = defineProps<{ next: SettlementRow | null }>();

const { t } = useI18n();
const shortDate = (iso: string): string =>
    formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
const orderId = (): string | null => (props.next ? orderIdOf(props.next) : null);
const orderLabel = (): string => {
    const ref = props.next?.orders.find(o => o.orderId);
    return ref?.orderCode ?? ref?.orderErpId ?? '';
};
</script>

<template>
    <div class="bal-panel">
        <div class="bal-panel__title">{{ t('balance.next.title') }}</div>
        <div v-if="!next" class="bal-panel__sub">{{ t('balance.next.empty') }}</div>
        <template v-else>
            <div class="bal-info-line">
                <span>{{ t('balance.cells.amount') }}</span
                ><strong>{{ formatMinor(owed(next), next.currency) }}</strong>
            </div>
            <div class="bal-info-line">
                <span>{{ t('balance.next.dueDate') }}</span
                ><strong>{{ next.dueDate ? shortDate(next.dueDate) : '—' }}</strong>
            </div>
            <div class="bal-info-line">
                <span>{{ t('balance.next.document') }}</span
                ><strong>{{ next.number }}</strong>
            </div>
            <div v-if="orderId()" class="bal-info-line">
                <span>{{ t('balance.next.order') }}</span
                ><strong>{{ orderLabel() }}</strong>
            </div>
            <RouterLink
                :to="orderId() ? `/orders/${orderId()}` : '/settlements'"
                class="bal-btn bal-btn--primary bal-btn--wide"
            >
                {{ orderId() ? t('balance.next.openOrder') : t('balance.next.openStatement') }}
            </RouterLink>
        </template>
    </div>
</template>

<style scoped src="./BalancePage.css"></style>
<style scoped src="./BalancePanels.css"></style>
