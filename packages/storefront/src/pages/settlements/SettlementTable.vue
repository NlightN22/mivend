<script setup lang="ts">
import {
    MvAmountDisplay,
    MvDocumentTypeChip,
    MvStatusBadge,
    formatDocumentNumber,
} from '@mivend/ui-kit';
import {
    PAYMENT_STATUS_LABEL,
    PAYMENT_STATUS_VARIANT,
    toMajor,
    type SettlementRow,
} from './useSettlementDocuments';

defineProps<{ rows: SettlementRow[] }>();

const formatDate = (value: string | null | undefined): string =>
    value ? new Date(value).toLocaleDateString('ru-RU') : '—';
</script>

<template>
    <div class="settlement-table">
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Contract</th>
                    <th>Organization</th>
                    <th class="num">Amount</th>
                    <th>Order</th>
                    <th>Due date</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.id">
                    <td>
                        <MvDocumentTypeChip :type="row.category" />
                        <div class="sub">{{ row.documentTypeLabel }}</div>
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
                            {{ row.orders.length }} orders
                        </template>
                        <template v-else>—</template>
                    </td>
                    <td>{{ formatDate(row.dueDate) }}</td>
                    <td>
                        <span
                            v-if="row.paymentStatus === 'unknown'"
                            :title="PAYMENT_STATUS_LABEL.unknown"
                            >—</span
                        >
                        <MvStatusBadge
                            v-else-if="row.paymentStatus"
                            :variant="PAYMENT_STATUS_VARIANT[row.paymentStatus]"
                        >
                            {{ PAYMENT_STATUS_LABEL[row.paymentStatus] }}
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
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
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
    color: #66736e;
    font-size: 12px;
    font-weight: 800;
    border-bottom: 1px solid #edf2ef;
    white-space: nowrap;
}

td {
    padding: 12px 16px;
    border-bottom: 1px solid #f2f6f4;
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

.sub {
    margin-top: 4px;
    color: #66736e;
    font-size: 12px;
}

.debit {
    color: #1b2d26;
}

.credit {
    color: #008a64;
}
</style>
