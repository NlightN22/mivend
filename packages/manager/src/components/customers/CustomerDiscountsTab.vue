<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvButton } from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import type { DiscountRuleItem } from '../../api/customers';

// Genuinely bounded (AGENTS.md pagination exemption) — DiscountGrantResolver.
// discountGrantsForCounterparty returns only the grants currently applying to one counterparty,
// not an ever-growing history, so no server-side pagination is needed here (unlike
// Orders/Invoices/Payments tabs, which fetch their own paginated pages).
const props = defineProps<{ discounts: DiscountRuleItem[] }>();
const router = useRouter();

// No exact "expiring soon" threshold has been decided yet (see
// manager-portal-concept.md §8.2, "N не определено") — 14 days is a reasonable placeholder,
// consistent with the same approximation used on the Dashboard.
const EXPIRING_SOON_DAYS = 14;

function status(discount: DiscountRuleItem): { label: string; variant: StatusBadgeVariant } {
    const now = Date.now();
    const validTo = new Date(discount.validTo).getTime();
    if (validTo < now) return { label: 'Expired', variant: 'neutral' };
    if (validTo - now < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) {
        return { label: 'Expiring soon', variant: 'warning' };
    }
    return { label: 'Active', variant: 'success' };
}

// MvTable renders this same column config as mobile cards below its own breakpoint — no
// separate hand-written mobile column set needed (see MvTable.vue).
const columns: Column<TableRow>[] = [
    { key: 'scope', title: 'Applies to', dataKey: 'scope', width: 220, flexGrow: 1, mobile: { primary: true } },
    { key: 'percent', title: 'Discount', dataKey: 'percent', width: 110, align: 'right' },
    { key: 'validTo', title: 'Valid until', dataKey: 'validTo', width: 130 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 140,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(MvStatusBadge, { variant: row.statusVariant as StatusBadgeVariant }, () => row.status as string);
        },
        mobile: { badge: true },
    },
];

const rows = computed<TableRow[]>(() =>
    props.discounts.map(discount => ({
        scope: discount.facetValueCode ?? 'All products',
        percent: `${discount.percent}%`,
        validTo: new Date(discount.validTo).toLocaleDateString('en-US'),
        status: status(discount).label,
        statusVariant: status(discount).variant,
    })),
);

function goToDiscounts(): void {
    router.push('/discounts');
}
</script>

<template>
    <div class="customer-discounts">
        <div class="customer-discounts__header">
            <MvButton size="sm" @click="goToDiscounts">New discount grant</MvButton>
        </div>
        <MvTable
            :columns="columns"
            :data="rows"
            :height="Math.max(rows.length, 1) * 52 + 40"
            empty-text="No discounts apply to this customer"
        />
    </div>
</template>

<style scoped>
.customer-discounts__header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
}
</style>
