<script setup lang="ts">
import { computed } from 'vue';
import { IconCalendar, IconUser, IconUserCircle } from '@tabler/icons-vue';
import { MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import { ORDER_STATE_BADGE_VARIANT, ORDER_STATE_LABEL } from '../../api/orders';
import type { OrderDetail } from '../../api/orderDetail';
import type { useReservationActions } from '../../composables/useReservationActions';
import { canConfirmOrder } from '../../utils/canConfirmOrder';
import OrderHeaderActions from './OrderHeaderActions.vue';

const props = defineProps<{
    order: OrderDetail;
    managerName: string | null;
    canSeeChecks: boolean;
    reservation: ReturnType<typeof useReservationActions>;
}>();
defineEmits<{ recompute: []; cancelled: [] }>();

const confirmable = computed(() =>
    canConfirmOrder({
        cancellable: props.order.cancellable,
        lineCount: props.order.lines.length,
        customFields: props.order.customFields,
    }),
);
const customerName = computed(() => {
    const customer = props.order.customer;
    if (!customer) return null;
    return customer.counterparty?.shortName ?? `${customer.firstName} ${customer.lastName}`;
});
</script>

<template>
    <header class="order-header">
        <div class="order-header__breadcrumb">
            <RouterLink to="/orders">Orders</RouterLink> / {{ formatDocumentNumber(order.code) }}
        </div>
        <div class="order-header__row">
            <h1 class="order-header__title">
                Order {{ formatDocumentNumber(order.code) }}
                <MvStatusBadge :variant="ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral'">
                    {{ ORDER_STATE_LABEL[order.state] ?? order.state }}
                </MvStatusBadge>
                <MvStatusBadge v-if="order.creditLimitExceeded" variant="warning">
                    Credit limit exceeded
                </MvStatusBadge>
            </h1>
            <OrderHeaderActions
                :order-id="order.id"
                :cancellable="order.cancellable"
                :confirmable="confirmable"
                :can-see-checks="canSeeChecks"
                :reservation="reservation"
                @recompute="$emit('recompute')"
                @cancelled="$emit('cancelled')"
            />
        </div>
        <div class="order-header__meta">
            <span v-if="customerName" class="order-header__item">
                <IconUser :size="16" />
                Customer:
                <RouterLink
                    v-if="order.customer?.counterparty"
                    :to="`/customers/${order.customer.counterparty.id}`"
                    class="order-header__link"
                >
                    {{ customerName }}
                </RouterLink>
                <strong v-else>{{ customerName }}</strong>
            </span>
            <span v-if="managerName" class="order-header__item">
                <IconUserCircle :size="16" />
                Manager: <strong>{{ managerName }}</strong>
            </span>
            <span class="order-header__item">
                <IconCalendar :size="16" />
                Created:
                <strong>{{ new Date(order.createdAt).toLocaleDateString('en-US') }}</strong>
            </span>
        </div>
    </header>
</template>

<style scoped>
.order-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.order-header__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
}

.order-header__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.order-header__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.order-header__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.order-header__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 24px;
    font-size: 13px;
    color: var(--app-text-grey);
}

.order-header__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.order-header__item strong {
    color: var(--el-text-color-primary);
}

.order-header__link {
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
    text-decoration: none;
}

.order-header__link:hover {
    text-decoration: underline;
}

@media (max-width: 800px) {
    .order-header__title {
        font-size: 22px;
    }
}
</style>
