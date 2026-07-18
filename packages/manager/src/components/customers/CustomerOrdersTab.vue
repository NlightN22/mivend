<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { MvStatusBadge, MvMobileCardList, useIsMobileViewport } from '@mivend/ui-kit';
import type { MvMobileColumn } from '@mivend/ui-kit';
import type { CustomerOrderItem } from '../../api/customers';

const props = defineProps<{ orders: CustomerOrderItem[] }>();
const router = useRouter();
const isMobile = useIsMobileViewport();

function money(order: CustomerOrderItem): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currencyCode }).format(
        order.totalWithTax / 100,
    );
}

function openOrder(code: string): void {
    router.push(`/orders/${code}`);
}

// Mirrors OrdersTable.vue's mobile-card column config (same MvMobileCardList consumer) — kept
// as a plain array here rather than pulled onto MvTable/ElTableV2's virtualization, since this
// tab is intentionally the lightweight related-list view, not the full operational table.
const cardColumns = computed<MvMobileColumn[]>(() => [
    { key: 'code', title: 'Order #', dataKey: 'code', width: 0, mobile: { primary: true } },
    {
        key: 'state',
        title: 'Status',
        dataKey: 'state',
        width: 0,
        cellRenderer: ({ cellData }) => h(MvStatusBadge, {}, () => cellData as unknown as string),
        mobile: { badge: true },
    },
    { key: 'total', title: 'Total', dataKey: 'total', width: 0 },
    { key: 'date', title: 'Date placed', dataKey: 'date', width: 0 },
]);

const cardRows = computed(() =>
    props.orders.map(order => ({
        code: order.code,
        state: order.state,
        total: money(order),
        date: order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—',
    })),
);
</script>

<template>
    <MvMobileCardList
        v-if="isMobile"
        :columns="cardColumns"
        :data="cardRows"
        empty-text="No orders yet"
        @row-click="({ rowData }) => openOrder(rowData.code as string)"
    />
    <table v-else-if="props.orders.length" class="customer-orders">
        <thead>
            <tr>
                <th>Order #</th>
                <th>Status</th>
                <th>Total</th>
                <th>Date placed</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="order in props.orders" :key="order.code" @click="openOrder(order.code)">
                <td>{{ order.code }}</td>
                <td><MvStatusBadge>{{ order.state }}</MvStatusBadge></td>
                <td>{{ money(order) }}</td>
                <td>{{ order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—' }}</td>
            </tr>
        </tbody>
    </table>
    <p v-else class="customer-orders__empty">No orders yet</p>
</template>

<style scoped>
.customer-orders {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.customer-orders th {
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.customer-orders td {
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    cursor: pointer;
}

.customer-orders tbody tr:hover td {
    background: var(--el-fill-color-light, #f8fafc);
}

.customer-orders__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
