<script setup lang="ts">
import { formatMoney } from '../../i18n/format';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvDocumentTotals } from '@mivend/ui-kit';
import type { LineDiscountLimit } from '../../api/discountLimits';
import type { OrderDetail } from '../../api/orderDetail';
import { orderTotalRows } from '../../utils/orderTotalRows';
import OrderOverpaymentNotice from './OrderOverpaymentNotice.vue';

const { t } = useI18n();
const props = defineProps<{
    order: OrderDetail;
    retroTotal: number | null;
    lineDiscounts: Map<string, LineDiscountLimit>;
}>();

function money(amount: number): string {
    return formatMoney(amount, props.order.currencyCode);
}

const rows = computed(() => {
    const base = orderTotalRows(
        props.order,
        props.retroTotal,
        money,
        l => props.lineDiscounts.get(l.id) ?? null,
    );
    const sold = props.order.soldTotalWithTax;
    if (sold == null) return base;
    // The original total stays visible; the sold total takes the emphasis.
    return [
        ...base.map(row => (row.key === 'total' ? { ...row, emphasis: false } : row)),
        {
            key: 'sold',
            label: t('orderDetail.changes.soldTotal'),
            value: money(sold),
            emphasis: true,
        },
    ];
});
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
