<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate as formatLocaleDate } from '../../i18n/format';
import { MvAmountDisplay, MvDocumentTypeChip, formatDocumentNumber } from '@mivend/ui-kit';
import { documentTypeLabel, toMajor, type SettlementRow } from './useSettlementDocuments';

defineProps<{ row: SettlementRow }>();
const { t } = useI18n();

const formatDate = (value: string | null | undefined): string =>
    value ? formatLocaleDate(value, { dateStyle: 'short' }) : '—';
</script>

<template>
    <li class="mobile-row">
        <div class="line">
            <span class="chip">
                <MvDocumentTypeChip
                    :type="row.documentType"
                    :category="row.category"
                    :label="documentTypeLabel(row.documentType, row.documentTypeLabel)"
                />
            </span>
            <span class="num" :class="row.amount < 0 ? 'credit' : 'debit'">
                <span>{{ row.amount < 0 ? '−' : '+' }}</span>
                <MvAmountDisplay
                    :amount="Math.abs(toMajor(row.amount))"
                    :currency="row.currency"
                    :decimals="2"
                />
            </span>
        </div>
        <div class="line meta">
            <span class="main"
                ><span class="strong">{{ row.number }}</span> · {{ formatDate(row.date) }}</span
            >
            <span v-if="row.dueDate || row.orders.length" class="secondary">
                <span v-if="row.dueDate"
                    >{{ t('settlements.table.dueDate') }} {{ formatDate(row.dueDate) }}</span
                >
                <span v-if="row.orders.length === 1 && row.orders[0].orderCode"
                    >{{ t('settlements.table.order') }}
                    {{ formatDocumentNumber(row.orders[0].orderCode) }}</span
                >
                <span v-else-if="row.orders.length > 1">{{
                    t('settlements.table.orders', row.orders.length)
                }}</span>
            </span>
        </div>
    </li>
</template>

<style scoped>
.mobile-row {
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-nav-border);
    list-style: none;
}

.mobile-row:last-child {
    border-bottom: 0;
}

.line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
}

.chip {
    min-width: 0;
    overflow: hidden;
}

.num {
    flex: none;
    white-space: nowrap;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
}

.meta {
    align-items: flex-start;
    margin-top: 6px;
    font-size: 13px;
    color: var(--app-nav-label);
}

.main {
    flex: none;
}

.strong {
    font-weight: 800;
    color: var(--app-nav-text-strong);
}

.secondary {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 2px 8px;
    min-width: 0;
    font-size: 12px;
    text-align: right;
    overflow-wrap: anywhere;
}

.debit {
    color: var(--app-nav-text-strong);
}

.credit {
    color: var(--app-nav-accent);
}
</style>
