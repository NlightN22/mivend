<script setup lang="ts">
import { computed } from 'vue';
import type { OrderDetail } from '../../api/orderDetail';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';
import OrderOverpaymentNotice from './OrderOverpaymentNotice.vue';
import OrderPaidAmount from './OrderPaidAmount.vue';

const props = defineProps<{ order: OrderDetail }>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.order.currencyCode,
    }).format(amount / 100);
}

const packaging = computed(() => formatPackaging(useOrderPackaging(props.order.lines)));
const paid = computed(() => props.order.customFields.erpPaidAmount);
const overpaid = computed(() =>
    paid.value != null && paid.value > props.order.totalWithTax
        ? paid.value - props.order.totalWithTax
        : null,
);
</script>

<template>
    <div class="order-totals">
        <span>Subtotal: {{ money(order.subTotalWithTax) }}</span>
        <span>Shipping: {{ money(order.shippingWithTax) }}</span>
        <span v-if="packaging">Weight / volume: {{ packaging }}</span>
        <OrderPaidAmount
            v-if="paid != null"
            :paid="money(paid)"
            :total="money(order.totalWithTax)"
            :overpaid="overpaid !== null ? money(overpaid) : null"
        />
        <strong class="order-totals__total">Total: {{ money(order.totalWithTax) }}</strong>
    </div>
    <OrderOverpaymentNotice v-if="overpaid !== null" :amount="money(overpaid)" />
</template>

<style scoped>
.order-totals {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin-top: 14px;
    font-size: 13px;
}

.order-totals__total {
    font-size: 15px;
}
</style>
