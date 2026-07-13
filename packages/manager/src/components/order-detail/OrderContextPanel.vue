<script setup lang="ts">
import type { OrderDetail } from '../../api/orderDetail';
import type { CustomerCredit } from '../../api/customers';

const props = defineProps<{
    order: OrderDetail;
    managerName: string | null;
    // Null for a caller without ReadCounterpartyCredit — see fetchCreditByCounterpartyId.
    credit: CustomerCredit | null;
}>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.order.currencyCode,
    }).format(amount / 100);
}
</script>

<template>
    <div v-if="order.customer" class="order-context">
        <div class="order-context__row">
            <span class="order-context__label">Customer</span>
            <span class="order-context__value">
                {{ order.customer.counterparty?.shortName ?? `${order.customer.firstName} ${order.customer.lastName}` }}
            </span>
        </div>
        <div v-if="order.customer.counterparty?.inn" class="order-context__row">
            <span class="order-context__label">INN</span>
            <span class="order-context__value">{{ order.customer.counterparty.inn }}</span>
        </div>
        <div v-if="managerName" class="order-context__row">
            <span class="order-context__label">Assigned manager</span>
            <span class="order-context__value">{{ managerName }}</span>
        </div>
        <div v-if="order.customer.counterparty" class="order-context__row">
            <span class="order-context__label">Price type</span>
            <span class="order-context__value">{{ order.customer.counterparty.priceType }}</span>
        </div>
        <div v-if="credit" class="order-context__row">
            <span class="order-context__label">Credit limit</span>
            <span class="order-context__value">{{ money(credit.creditLimit) }}</span>
        </div>
        <div v-if="credit" class="order-context__row">
            <span class="order-context__label">Credit balance</span>
            <span class="order-context__value order-context__value--danger">
                {{ money(credit.creditBalance) }} used
            </span>
        </div>
        <RouterLink
            v-if="order.customer.counterparty"
            class="order-context__link"
            :to="`/customers/${order.customer.counterparty.id}`"
        >
            Customer card
        </RouterLink>
    </div>
</template>

<style scoped>
.order-context {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.order-context__row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.order-context__row:last-of-type {
    padding-bottom: 0;
    border-bottom: 0;
}

.order-context__label {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.order-context__value {
    font-weight: 700;
    text-align: right;
}

.order-context__value--danger {
    color: var(--el-color-danger, #dc2626);
}

.order-context__link {
    margin-top: 4px;
    color: var(--el-color-primary-dark-2, #008a70);
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
}
</style>
