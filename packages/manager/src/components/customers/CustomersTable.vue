<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { CustomerListItem, CustomerCredit } from '../../api/customers';

const props = defineProps<{
    customers: CustomerListItem[];
    credit: Map<string, CustomerCredit>;
    discountCounts: Map<string, number>;
    lastOrderDates: Map<string, string>;
}>();
const router = useRouter();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'name', title: 'Company name', dataKey: 'name', width: 220 },
    { key: 'contact', title: 'Contact person', dataKey: 'contact', width: 180 },
    { key: 'creditLimit', title: 'Credit limit', dataKey: 'creditLimit', width: 130, align: 'right' },
    { key: 'creditBalance', title: 'Credit balance', dataKey: 'creditBalance', width: 140, align: 'right' },
    {
        key: 'discounts',
        title: 'Active discounts',
        dataKey: 'discounts',
        width: 150,
        cellRenderer: ({ cellData }) => {
            const count = cellData as unknown as number;
            if (!count) return h('span', '—');
            return h(MvStatusBadge, { variant: 'info' }, () => `${count} active`);
        },
    },
    { key: 'lastOrder', title: 'Last order', dataKey: 'lastOrder', width: 130 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 110,
        cellRenderer: ({ cellData }) =>
            h(MvStatusBadge, { variant: cellData ? 'success' : 'neutral' }, () => (cellData ? 'Active' : 'Inactive')),
    },
]);

const rows = computed<TableRow[]>(() =>
    props.customers.map(c => {
        const primaryContact = c.contacts.find(p => p.isPrimary) ?? c.contacts[0];
        const credit = props.credit.get(c.id);
        const lastOrder = props.lastOrderDates.get(c.id);
        return {
            name: c.shortName,
            contact: primaryContact?.name ?? '—',
            creditLimit: credit ? money(credit.creditLimit) : '—',
            creditBalance: credit ? money(credit.creditBalance) : '—',
            discounts: props.discountCounts.get(c.priceType) ?? 0,
            lastOrder: lastOrder ? new Date(lastOrder).toLocaleDateString('en-US') : '—',
            status: c.isActive,
            _customerId: c.id,
        };
    }),
);

function handleRowClick({ rowData }: { rowData: TableRow }): void {
    router.push(`/customers/${rowData._customerId as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 52 + 40"
        empty-text="You don't have any assigned clients yet"
        @row-click="handleRowClick"
    />
</template>
