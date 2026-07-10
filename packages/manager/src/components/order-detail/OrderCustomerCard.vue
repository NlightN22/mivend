<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetail } from '../../api/orderDetail';

defineProps<{ order: OrderDetail; managerName: string | null }>();
</script>

<template>
    <div v-if="order.customer" class="order-customer-card">
        <div class="order-customer-card__main">
            <strong>{{ order.customer.firstName }} {{ order.customer.lastName }}</strong>
            <span v-if="order.customer.counterparty?.shortName">
                {{ order.customer.counterparty.shortName }}
            </span>
            <span v-if="order.customer.counterparty?.inn" class="order-customer-card__meta">
                INN {{ order.customer.counterparty.inn }}
            </span>
        </div>
        <MvStatusBadge v-if="managerName" variant="neutral">Manager: {{ managerName }}</MvStatusBadge>
        <RouterLink
            v-if="order.customer.counterparty"
            class="order-customer-card__link"
            :to="`/customers/${order.customer.counterparty.id}`"
        >
            View customer
        </RouterLink>
    </div>
</template>

<style scoped>
.order-customer-card {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}

.order-customer-card__main {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 14px;
}

.order-customer-card__meta {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}

.order-customer-card__link {
    margin-left: auto;
    color: var(--el-color-primary-dark-2, #008a70);
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
}
</style>
