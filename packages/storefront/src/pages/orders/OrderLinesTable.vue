<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvLineChangeCell, MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetail } from './useOrderDetail';
import { formatAmount } from './orderFormat';
import { useLineChanges } from './useLineChanges';

const props = defineProps<{ order: OrderDetail }>();
const { t } = useI18n();
const { hasChanges, changeOf } = useLineChanges(() => props.order);
const anyReserved = computed(() => props.order.lines.some(line => line.reserved));

function formatUntil(iso: string): string {
    return formatDate(iso, { day: 'numeric', month: 'long' });
}
</script>

<template>
    <div class="olt">
        <div class="olt-head">
            <h2 class="olt-title">{{ t('orders.detail.items') }}</h2>
            <MvStatusBadge v-if="hasChanges" variant="warning">{{
                t('orders.detail.changes.badge')
            }}</MvStatusBadge>
        </div>
        <table class="olt-table">
            <thead>
                <tr>
                    <th>{{ t('orders.detail.sku') }}</th>
                    <th>{{ t('orders.detail.product') }}</th>
                    <th v-if="anyReserved">{{ t('orders.detail.reserve') }}</th>
                    <th class="olt-num">
                        {{
                            hasChanges ? t('orders.detail.changes.ordered') : t('orders.detail.qty')
                        }}
                    </th>
                    <th v-if="hasChanges" class="olt-num">
                        {{ t('orders.detail.changes.actual') }}
                    </th>
                    <th v-if="hasChanges" class="olt-num">
                        {{ t('orders.detail.changes.change') }}
                    </th>
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
                    <td v-if="hasChanges" class="olt-num">
                        {{ changeOf(line.id)?.actual ?? line.quantity }}
                    </td>
                    <td v-if="hasChanges" class="olt-num">
                        <MvLineChangeCell
                            v-if="changeOf(line.id)"
                            :events="changeOf(line.id)!.events"
                            :ordered="changeOf(line.id)!.ordered"
                            :actual="changeOf(line.id)!.actual"
                            :heading="t('orders.detail.changes.heading')"
                            :product-name="line.productVariant.product.name"
                            :sku="line.productVariant.sku"
                            :footer="
                                t('orders.detail.changes.footer', {
                                    actual: changeOf(line.id)!.actual,
                                    ordered: changeOf(line.id)!.ordered,
                                })
                            "
                            :info-label="t('orders.detail.changes.info')"
                        />
                    </td>
                    <td class="olt-num">
                        {{ formatAmount(line.discountedUnitPriceWithTax, order.currencyCode) }}
                    </td>
                    <td class="olt-num olt-bold">
                        {{ formatAmount(line.discountedLinePriceWithTax, order.currencyCode) }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.olt {
    min-width: 0;
    overflow-x: auto;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border);
    border-radius: 20px;
    padding: 18px 20px;
}
.olt-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 14px;
}
.olt-title {
    margin: 0;
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
    background: var(--el-bg-color-page);
    color: var(--app-nav-label);
    font-weight: 850;
    font-size: 12px;
}
.olt-table td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--app-nav-border);
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
    color: var(--app-nav-label);
    font-size: 12px;
}
.olt-sku {
    color: var(--app-nav-label);
    font-weight: 850;
    white-space: nowrap;
}
.olt-bold {
    font-weight: 950;
}
</style>
