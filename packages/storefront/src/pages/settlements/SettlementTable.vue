<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate as formatLocaleDate } from '../../i18n/format';
import {
    MvAmountDisplay,
    MvDocumentTypeChip,
    MvStatusBadge,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import SettlementMobileRow from './SettlementMobileRow.vue';
import {
    PAYMENT_STATUS_VARIANT,
    documentTypeLabel,
    paymentStatusLabel,
    toMajor,
    type SettlementRow,
} from './useSettlementDocuments';

defineProps<{ rows: SettlementRow[] }>();
const { t } = useI18n();

const formatDate = (value: string | null | undefined): string =>
    value ? formatLocaleDate(value, { dateStyle: 'short' }) : '—';
</script>

<template>
    <div class="settlement-table">
        <ul class="mobile-list">
            <SettlementMobileRow v-for="row in rows" :key="row.id" :row="row" />
        </ul>
        <table>
            <thead>
                <tr>
                    <th>{{ t('settlements.table.type') }}</th>
                    <th>{{ t('settlements.table.document') }}</th>
                    <th>{{ t('settlements.table.date') }}</th>
                    <th>{{ t('settlements.table.contract') }}</th>
                    <th>{{ t('settlements.table.organization') }}</th>
                    <th class="num">{{ t('settlements.table.amount') }}</th>
                    <th>{{ t('settlements.table.order') }}</th>
                    <th>{{ t('settlements.table.dueDate') }}</th>
                    <th>{{ t('settlements.table.status') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.id">
                    <td>
                        <MvDocumentTypeChip
                            :type="row.documentType"
                            :category="row.category"
                            :label="documentTypeLabel(row.documentType, row.documentTypeLabel)"
                        />
                    </td>
                    <td class="strong">{{ row.number }}</td>
                    <td>{{ formatDate(row.date) }}</td>
                    <td>{{ row.contractName ?? '—' }}</td>
                    <td>{{ row.organizationName ?? '—' }}</td>
                    <td class="num" :class="row.amount < 0 ? 'credit' : 'debit'">
                        <span>{{ row.amount < 0 ? '−' : '+' }}</span>
                        <MvAmountDisplay
                            :amount="Math.abs(toMajor(row.amount))"
                            :currency="row.currency"
                            :decimals="2"
                        />
                    </td>
                    <td>
                        <template v-if="row.orders.length === 1">
                            {{
                                row.orders[0].orderCode
                                    ? formatDocumentNumber(row.orders[0].orderCode)
                                    : '—'
                            }}
                        </template>
                        <template v-else-if="row.orders.length > 1">
                            {{ t('settlements.table.orders', row.orders.length) }}
                        </template>
                        <template v-else>—</template>
                    </td>
                    <td>{{ formatDate(row.dueDate) }}</td>
                    <td>
                        <span
                            v-if="row.paymentStatus === 'unknown'"
                            :title="paymentStatusLabel('unknown')"
                            >—</span
                        >
                        <MvStatusBadge
                            v-else-if="row.paymentStatus"
                            :variant="PAYMENT_STATUS_VARIANT[row.paymentStatus]"
                        >
                            {{ paymentStatusLabel(row.paymentStatus) }}
                        </MvStatusBadge>
                        <span v-else>—</span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.settlement-table {
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

th {
    text-align: left;
    padding: 14px 16px;
    color: var(--app-nav-label);
    font-size: 12px;
    font-weight: 800;
    border-bottom: 1px solid var(--app-nav-border);
    white-space: nowrap;
}

td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-nav-border);
    vertical-align: middle;
}

tr:last-child td {
    border-bottom: 0;
}

.num {
    text-align: right;
    white-space: nowrap;
}

.strong {
    font-weight: 800;
}

.debit {
    color: var(--app-nav-text-strong);
}

.credit {
    color: var(--app-nav-accent);
}

.mobile-list {
    display: none;
    margin: 0;
    padding: 0;
}

@media (max-width: 760px) {
    .mobile-list {
        display: block;
    }

    table {
        display: none;
    }
}
</style>
