<script setup lang="ts">
import type { OrderDetail } from '../../api/orderDetail';
import { isNotRegisteredInErp } from '../../composables/isNotRegisteredInErp';
import OrderContractPanel from './OrderContractPanel.vue';
import OrderDeliveryPanel from './OrderDeliveryPanel.vue';
import OrderErpRegistration from './OrderErpRegistration.vue';

defineProps<{
    order: OrderDetail;
    contractLocked: boolean;
    blockedSkus: string[];
    canEditDelivery: boolean;
}>();
defineEmits<{ changed: [] }>();
</script>

<template>
    <dl class="order-fields">
        <div class="order-fields__cell">
            <dt>Contract</dt>
            <dd>
                <OrderContractPanel
                    :order-id="order.id"
                    :locked="contractLocked"
                    :blocked-skus="blockedSkus"
                    @changed="$emit('changed')"
                />
            </dd>
        </div>
        <div class="order-fields__cell">
            <dt>Delivery</dt>
            <dd>
                <OrderDeliveryPanel
                    :order-id="order.id"
                    :shipping-codes="order.shippingLines.map(l => l.shippingMethod?.code ?? '')"
                    :trading-point-id="order.customFields.tradingPointId"
                    :delivery-address="order.customFields.deliveryAddress"
                    :points="order.customer?.counterparty?.tradingPoints ?? []"
                    :can-edit="canEditDelivery"
                    @changed="$emit('changed')"
                />
            </dd>
        </div>
        <div class="order-fields__cell">
            <dt>Price type</dt>
            <dd data-testid="order-price-type">
                {{ order.customer?.counterparty?.priceType ?? '—' }}
            </dd>
        </div>
        <div class="order-fields__cell">
            <dt>ERP registration</dt>
            <dd>
                <OrderErpRegistration
                    :not-registered="isNotRegisteredInErp(order.customFields)"
                    :erp-status="order.customFields.erpRegistrationStatus ?? null"
                    :document-number="order.customFields.erpRegistrationDocumentNumber ?? null"
                    :rejection-code="order.customFields.erpRejectionReasonCode ?? null"
                    :rejection-text="order.customFields.erpRejectionReasonText ?? null"
                    :raw-erp-status="order.customFields.erpStatus ?? null"
                />
            </dd>
        </div>
    </dl>
</template>

<style scoped>
.order-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px 24px;
    margin: 0;
    padding: 14px 16px;
    border: 1px solid var(--app-nav-border);
    border-radius: var(--app-radius-md, 12px);
    background: var(--app-surface);
}

.order-fields__cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.order-fields dt {
    color: var(--app-text-grey);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.order-fields dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}
</style>
