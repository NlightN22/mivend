<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { OrderDetail } from './useOrderDetail';
import { formatAmount } from './orderFormat';
import OrderPaidRow from './OrderPaidRow.vue';

defineProps<{ order: OrderDetail }>();
const { t } = useI18n();
</script>

<template>
    <div class="otc">
        <h2 class="otc-title">{{ t('orders.detail.summary') }}</h2>
        <div class="otc-row">
            <span>{{ t('orders.detail.subtotal') }} ({{ order.lines.length }})</span>
            <span>{{ formatAmount(order.subTotalWithTax, order.currencyCode) }}</span>
        </div>
        <div class="otc-row">
            <span>{{ t('orders.detail.shipping') }}</span>
            <span>{{ formatAmount(order.shippingWithTax, order.currencyCode) }}</span>
        </div>
        <div class="otc-row otc-total">
            <span>{{ t('orders.detail.orderTotal') }}</span>
            <span>{{ formatAmount(order.totalWithTax, order.currencyCode) }}</span>
        </div>
        <OrderPaidRow
            v-if="order.customFields?.erpPaidAmount != null"
            :paid="formatAmount(order.customFields.erpPaidAmount, order.currencyCode)"
            :total="formatAmount(order.totalWithTax, order.currencyCode)"
            :overpaid="
                order.customFields.erpPaidAmount > order.totalWithTax
                    ? formatAmount(
                          order.customFields.erpPaidAmount - order.totalWithTax,
                          order.currencyCode,
                      )
                    : null
            "
        />
    </div>
</template>

<style scoped>
.otc {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.otc-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}
.otc-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 13px;
    color: #344640;
}
.otc-total {
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid #edf2ef;
    font-weight: 950;
    font-size: 16px;
}
</style>
