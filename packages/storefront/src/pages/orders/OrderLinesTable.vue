<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetail } from './useOrderDetail';
import { formatAmount } from './orderFormat';

const props = defineProps<{ order: OrderDetail }>();
const { t } = useI18n();
const anyReserved = computed(() => props.order.lines.some(line => line.reserved));

function formatUntil(iso: string): string {
    return formatDate(iso, { day: 'numeric', month: 'long' });
}
</script>

<template>
    <div class="olt">
        <h2 class="olt-title">{{ t('orders.detail.items') }}</h2>
        <table class="olt-table">
            <thead>
                <tr>
                    <th>{{ t('orders.detail.sku') }}</th>
                    <th>{{ t('orders.detail.product') }}</th>
                    <th v-if="anyReserved">{{ t('orders.detail.reserve') }}</th>
                    <th class="olt-num">{{ t('orders.detail.qty') }}</th>
                    <th class="olt-num">{{ t('orders.detail.price') }}</th>
                    <th class="olt-num">{{ t('orders.detail.total') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="line in order.lines" :key="line.id">
                    <td class="olt-sku">{{ line.productVariant.sku }}</td>
                    <td>{{ line.productVariant.product.name }}</td>
                    <td v-if="anyReserved" class="olt-reserve">
                        <template v-if="line.reserved">
                            <MvStatusBadge variant="success">{{
                                t('orders.detail.reserved')
                            }}</MvStatusBadge>
                            <span v-if="line.reservedUntil" class="olt-until">{{
                                t('orders.detail.reservedUntil', {
                                    date: formatUntil(line.reservedUntil),
                                })
                            }}</span>
                        </template>
                    </td>
                    <td class="olt-num">{{ line.quantity }}</td>
                    <td class="olt-num">
                        {{ formatAmount(line.unitPriceWithTax, order.currencyCode) }}
                    </td>
                    <td class="olt-num olt-bold">
                        {{ formatAmount(line.linePriceWithTax, order.currencyCode) }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.olt {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.olt-title {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -0.035em;
}
.olt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.olt-table th {
    text-align: left;
    padding: 10px;
    background: #f6f9f8;
    color: #66736e;
    font-weight: 850;
    font-size: 12px;
}
.olt-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #f3f8f6;
}
.olt-table th.olt-num,
.olt-num {
    text-align: right;
    white-space: nowrap;
}
.olt-reserve {
    white-space: nowrap;
}
.olt-until {
    margin-left: 6px;
    color: #66736e;
    font-size: 12px;
}
.olt-sku {
    color: #66736e;
    font-weight: 850;
    white-space: nowrap;
}
.olt-bold {
    font-weight: 950;
}
</style>
