<script setup lang="ts">
import { computed } from 'vue';
import type { OrderDetail } from '../../api/orderDetail';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';
import { totalDiscountMinor } from '../../utils/orderTotals';
import OrderOverpaymentNotice from './OrderOverpaymentNotice.vue';
import OrderPaidAmount from './OrderPaidAmount.vue';

const props = defineProps<{ order: OrderDetail; retroTotal: number | null }>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.order.currencyCode,
    }).format(amount / 100);
}

const packaging = computed(() => formatPackaging(useOrderPackaging(props.order.lines)));
const discount = computed(() => totalDiscountMinor(props.order.lines));
const paid = computed(() => props.order.customFields.erpPaidAmount);
const overpaid = computed(() =>
    paid.value != null && paid.value > props.order.totalWithTax
        ? paid.value - props.order.totalWithTax
        : null,
);
</script>

<template>
    <div class="order-totals">
        <span class="order-totals__item" data-testid="order-totals-positions">
            Total: {{ order.lines.length }}
            {{ order.lines.length === 1 ? 'position' : 'positions' }}
        </span>
        <span v-if="packaging" class="order-totals__item">Weight / volume: {{ packaging }}</span>
        <span v-if="discount > 0" class="order-totals__item" data-testid="order-totals-discount">
            Discount: {{ money(discount) }}
        </span>
        <span v-if="order.shippingWithTax > 0" class="order-totals__item">
            Shipping: {{ money(order.shippingWithTax) }}
        </span>
        <span
            v-if="retroTotal !== null"
            class="order-totals__item"
            data-testid="order-totals-retro"
        >
            Expected retro bonus: {{ money(retroTotal) }}
        </span>
        <OrderPaidAmount
            v-if="paid != null"
            :paid="money(paid)"
            :total="money(order.totalWithTax)"
            :overpaid="overpaid !== null ? money(overpaid) : null"
        />
        <slot name="flag" />
        <strong class="order-totals__total">{{ money(order.totalWithTax) }}</strong>
    </div>
    <OrderOverpaymentNotice v-if="overpaid !== null" :amount="money(overpaid)" />
</template>

<style scoped>
.order-totals {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color);
    font-size: 13px;
    color: var(--app-text-grey);
}

.order-totals__total {
    font-size: 18px;
    color: var(--el-text-color-primary);
}
</style>
