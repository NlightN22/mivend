<script setup lang="ts">
import { computed } from 'vue';
import { MvDocumentTotals } from '@mivend/ui-kit';
import type { LineDiscountLimit } from '../../api/discountLimits';
import type { OrderDetail } from '../../api/orderDetail';
import { orderTotalRows } from '../../utils/orderTotalRows';
import OrderOverpaymentNotice from './OrderOverpaymentNotice.vue';

const props = defineProps<{
    order: OrderDetail;
    retroTotal: number | null;
    lineDiscounts: Map<string, LineDiscountLimit>;
}>();

function money(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.order.currencyCode,
    }).format(amount / 100);
}

const rows = computed(() =>
    orderTotalRows(
        props.order,
        props.retroTotal,
        money,
        l => props.lineDiscounts.get(l.id) ?? null,
    ),
);
const paid = computed(() => props.order.customFields.erpPaidAmount);
const overpaid = computed(() =>
    paid.value != null && paid.value > props.order.totalWithTax
        ? paid.value - props.order.totalWithTax
        : null,
);
</script>

<template>
    <MvDocumentTotals :rows="rows">
        <template #value-total="{ row }">
            <slot name="flag" />
            {{ row.value }}
        </template>
    </MvDocumentTotals>
    <OrderOverpaymentNotice v-if="overpaid !== null" :amount="money(overpaid)" />
</template>
