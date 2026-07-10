<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { CustomerOrderItem } from '../../api/customers';

const props = defineProps<{ orders: CustomerOrderItem[] }>();
const router = useRouter();

function money(order: CustomerOrderItem): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currencyCode }).format(
        order.totalWithTax / 100,
    );
}
</script>

<template>
    <table v-if="props.orders.length" class="customer-orders">
        <thead>
            <tr>
                <th>Order #</th>
                <th>Status</th>
                <th>Total</th>
                <th>Date placed</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="order in props.orders" :key="order.code" @click="router.push(`/orders/${order.code}`)">
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
