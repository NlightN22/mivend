<script setup lang="ts">
import { computed } from 'vue';
import { formatDocumentNumber } from '@mivend/ui-kit';
import { formatDate, formatMoney } from '../../i18n/format';
import { orderDisplayNumber } from '../orders/orderFormat';
import { useStatusGroupLabel } from '../orders/useStatusGroupLabel';
import { useRepeatOrderAction } from '../orders/useRepeatOrderAction';
import type { OrderSummary } from '../orders/useOrders';
import { useOrderStatusesStore } from '../../stores/orderStatuses';

const props = defineProps<{ order: OrderSummary }>();
const statuses = useOrderStatusesStore();
const { repeating, repeatOrder } = useRepeatOrderAction();

const statusKey = computed(() => props.order.customFields?.erpStatus);
const statusLabel = useStatusGroupLabel(() => statusKey.value);
const isExternal = computed(() => props.order.customFields?.isExternal === true);
const meta = computed(() =>
    [
        formatDate(props.order.createdAt, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }),
        props.order.shippingAddress?.streetLine1,
    ]
        .filter(Boolean)
        .join(' · '),
);
</script>

<template>
    <div class="recent-order">
        <div class="recent-order__cell">
            <div class="recent-order__number">
                {{
                    $t('account.recentOrders.order', {
                        number: formatDocumentNumber(orderDisplayNumber(order)),
                    })
                }}
            </div>
            <div class="recent-order__meta recent-order__meta--truncate">{{ meta }}</div>
        </div>
        <div class="recent-order__cell recent-order__amount">
            {{ formatMoney(order.totalWithTax / 100, order.currencyCode) }}
        </div>
        <div class="recent-order__cell">
            <span
                class="recent-order__pill"
                :class="`recent-order__pill--${statuses.variant(statusKey)}`"
                :title="statuses.label(statusKey)"
            >
                {{ statusLabel }}
            </span>
        </div>
        <div class="recent-order__cell recent-order__meta">
            {{ $t('account.recentOrders.items', order.lines.length) }}
        </div>
        <div v-if="!isExternal" class="recent-order__cell recent-order__actions">
            <RouterLink
                :to="`/orders/${order.id}`"
                class="recent-order__btn recent-order__btn--primary"
            >
                {{ $t('account.recentOrders.action.open') }}
            </RouterLink>
            <button
                class="recent-order__btn"
                :disabled="repeating"
                @click="repeatOrder(order.lines)"
            >
                {{ $t('account.recentOrders.action.repeat') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.recent-order {
    min-height: 76px;
    display: grid;
    grid-template-columns: minmax(180px, 1.1fr) 120px 160px 100px 180px;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid #edf2ef;
    border-radius: 18px;
    background: #fbfdfc;
}

.recent-order__cell {
    min-width: 0;
}

.recent-order__number {
    font-weight: 950;
    margin-bottom: 4px;
    letter-spacing: -0.02em;
}

.recent-order__meta {
    color: #66736e;
    font-size: 13px;
    line-height: 1.32;
}

.recent-order__meta--truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.recent-order__amount {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: -0.035em;
}

.recent-order__pill {
    display: inline-flex;
    max-width: 100%;
    min-height: 30px;
    align-items: center;
    padding: 0 10px;
    border-radius: 999px;
    background: #e2f8ef;
    color: #008a64;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.recent-order__pill--muted {
    background: #eef4f1;
    color: #5f6e68;
}

.recent-order__pill--warning {
    background: #fff4e3;
    color: #a45e00;
}

.recent-order__pill--error {
    background: #ffeeed;
    color: #c0362c;
}

.recent-order__actions {
    display: flex;
    gap: 8px;
}

.recent-order__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    min-height: 38px;
    min-width: 86px;
    border-radius: 12px;
    padding: 0 13px;
    background: #f3f8f6;
    color: #263732;
    font: inherit;
    font-weight: 950;
    font-size: 13px;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
}

.recent-order__btn:disabled {
    opacity: 0.6;
    cursor: default;
}

.recent-order__btn--primary {
    background: #00a878;
    color: #fff;
}
</style>
