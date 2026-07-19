<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvProgressBar } from '@mivend/ui-kit';
import type { TableRow, ProgressBarVariant } from '@mivend/ui-kit';
import type { CustomerListItem, CustomerCredit } from '../../api/customers';
import type { BranchOption, ManagerOption } from '../../api/orders';

const props = defineProps<{
    customers: CustomerListItem[];
    credit: Map<string, CustomerCredit>;
    discountCounts: Map<string, number>;
    lastOrderDates: Map<string, string>;
    branches: BranchOption[];
    managers: ManagerOption[];
    // See OrdersTable's pageSize prop comment — stabilizes table height across page changes.
    pageSize?: number;
    loading?: boolean;
}>();
const router = useRouter();

function managerName(id: string | null): string {
    if (!id) return '—';
    return props.managers.find(m => m.id === id)?.name ?? '—';
}

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

function branchName(erpId: string | null): string {
    if (!erpId) return '';
    return props.branches.find(b => b.erpId === erpId)?.name ?? '';
}

// Same thresholds as the "Credit balance used" KPI card's "N clients above 80%" caption — see
// CustomersPage.vue.
function usageVariant(percent: number): ProgressBarVariant {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warn';
    return 'normal';
}

const columns = computed<Column<TableRow>[]>(() => [
    {
        key: 'name',
        title: 'Company name',
        dataKey: 'name',
        width: 220,
        mobile: { primary: true },
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h('div', { class: 'customers-table__company-cell' }, [
                h('span', { class: 'customers-table__company-name' }, row.name as string),
                h('span', { class: 'customers-table__company-meta' }, row.companyMeta as string),
            ]);
        },
    },
    { key: 'contact', title: 'Contact person', dataKey: 'contact', width: 170 },
    { key: 'manager', title: 'Manager', dataKey: 'manager', width: 150 },
    { key: 'creditLimit', title: 'Credit limit', dataKey: 'creditLimit', width: 130, align: 'right' },
    {
        key: 'creditBalance',
        title: 'Credit balance',
        dataKey: 'creditBalance',
        width: 170,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            if (row.creditUsagePercent === null) return h('span', '—');
            const percent = row.creditUsagePercent as number;
            return h('div', { class: 'customers-table__usage-cell' }, [
                h('div', { class: 'customers-table__usage-row' }, [
                    h('span', row.creditBalance as string),
                    h('span', { class: 'customers-table__usage-text' }, `${Math.round(percent)}%`),
                ]),
                h(MvProgressBar, { value: percent, max: 100, variant: usageVariant(percent) }),
            ]);
        },
    },
    {
        key: 'discounts',
        title: 'Active discounts',
        dataKey: 'discounts',
        width: 150,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            const count = row.discounts as number;
            if (!count) return h('span', '—');
            return h(
                MvStatusBadge,
                {
                    variant: 'info',
                    style: { cursor: 'pointer' },
                    onClick: (e: MouseEvent) => {
                        e.stopPropagation();
                        router.push({ path: '/discounts', query: { search: row.name as string } });
                    },
                },
                () => `${count} active`,
            );
        },
    },
    { key: 'lastOrder', title: 'Last order', dataKey: 'lastOrder', width: 130 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 110,
        mobile: { badge: true },
        cellRenderer: ({ cellData }) =>
            h(MvStatusBadge, { variant: cellData ? 'success' : 'neutral' }, () => (cellData ? 'Active' : 'Inactive')),
    },
]);

const rows = computed<TableRow[]>(() =>
    props.customers.map(c => {
        const primaryContact = c.contacts.find(p => p.isPrimary) ?? c.contacts[0];
        const credit = props.credit.get(c.id);
        const lastOrder = props.lastOrderDates.get(c.id);
        const usagePercent =
            credit && credit.creditLimit > 0 ? (credit.creditBalance / credit.creditLimit) * 100 : null;
        const branch = branchName(c.branchId);
        return {
            name: c.shortName,
            companyMeta: [c.inn ? `INN ${c.inn}` : null, branch, c.erpGroupLabel]
                .filter(Boolean)
                .join(' · '),
            contact: primaryContact?.name ?? '—',
            manager: managerName(c.assignedManagerId),
            creditLimit: credit ? money(credit.creditLimit) : '—',
            creditBalance: credit ? money(credit.creditBalance) : '—',
            creditUsagePercent: usagePercent,
            discounts: props.discountCounts.get(c.id) ?? 0,
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
        :height="Math.max(rows.length, props.pageSize ?? 1) * 60 + 40"
        :row-height="60"
        :loading="loading"
        empty-text="You don't have any assigned clients yet"
        @row-click="handleRowClick"
    />
</template>

<style scoped>
.customers-table__company-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.3;
}

.customers-table__company-name {
    font-weight: 700;
}

.customers-table__company-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customers-table__usage-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
    width: 130px;
}

.customers-table__usage-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
}

.customers-table__usage-text {
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
