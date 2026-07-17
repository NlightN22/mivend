<script setup lang="ts">
import { computed, h } from 'vue';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { PaymentListItem } from '../../api/payments';

const props = defineProps<{
    payments: PaymentListItem[];
    counterpartyNames: Map<string, string>;
    // See InvoicesTable.vue's identical doc comment.
    compact?: boolean;
    pageSize?: number;
}>();

const CHANNEL_LABEL: Record<string, string> = {
    'online-acquiring': 'Online',
    'branch-kassa': 'Branch kassa',
    'bank-transfer-erp': 'Bank transfer (ERP)',
};

function money(item: PaymentListItem): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currencyCode }).format(
        item.amount / 100,
    );
}

function customerName(item: PaymentListItem): string {
    if (!item.counterpartyId) return '—';
    return props.counterpartyNames.get(item.counterpartyId) ?? item.counterpartyId;
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [{ key: 'id', title: 'Payment #', dataKey: 'id', width: 120 }];
    if (!props.compact) {
        cols.push({ key: 'customer', title: 'Customer', dataKey: 'customer', width: 220 });
    }
    cols.push(
        { key: 'channel', title: 'Source', dataKey: 'channel', width: 160 },
        {
            key: 'status',
            title: 'Status',
            dataKey: 'status',
            width: 140,
            cellRenderer: ({ cellData }) => h(MvStatusBadge, {}, () => cellData as unknown as string),
        },
        { key: 'amount', title: 'Amount', dataKey: 'amount', width: 140, align: 'right' },
        { key: 'invoice', title: 'Invoice', dataKey: 'invoice', width: 120 },
    );
    return cols;
});

const rows = computed<TableRow[]>(() =>
    props.payments.map(payment => ({
        id: payment.id,
        customer: customerName(payment),
        channel: CHANNEL_LABEL[payment.channel] ?? payment.channel,
        status: payment.paymentStatus,
        amount: money(payment),
        invoice: payment.invoiceId ?? '—',
    })),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, props.pageSize ?? 1) * 52 + 40"
        empty-text="No payments match your filters"
    />
</template>
