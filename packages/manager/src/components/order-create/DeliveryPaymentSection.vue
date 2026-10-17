<script setup lang="ts">
import { MvSelect } from '@mivend/ui-kit';
import { DELIVERY_METHOD_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../../api/orderCreate';

defineProps<{
    tradingPoints: { id: string; name: string; address: string }[];
    deliveryMethod: string;
    tradingPointId: string;
    paymentMethod: string;
}>();
const emit = defineEmits<{
    'update:deliveryMethod': [value: string];
    'update:tradingPointId': [value: string];
    'update:paymentMethod': [value: string];
}>();
</script>

<template>
    <div class="delivery-payment">
        <div class="delivery-payment__field">
            <label>Delivery method</label>
            <MvSelect
                :model-value="deliveryMethod"
                :options="[...DELIVERY_METHOD_OPTIONS]"
                @update:model-value="emit('update:deliveryMethod', $event)"
            />
        </div>
        <div class="delivery-payment__field">
            <label>Payment method</label>
            <MvSelect
                :model-value="paymentMethod"
                :options="[...PAYMENT_METHOD_OPTIONS]"
                @update:model-value="emit('update:paymentMethod', $event)"
            />
        </div>
        <div v-if="deliveryMethod === 'courier'" class="delivery-payment__field">
            <label>Trading point / delivery address</label>
            <MvSelect
                :model-value="tradingPointId"
                :options="
                    tradingPoints.map(p => ({ value: p.id, label: `${p.name} — ${p.address}` }))
                "
                @update:model-value="emit('update:tradingPointId', $event)"
            />
            <p v-if="!tradingPoints.length" class="delivery-payment__hint">
                The client has no trading points; use self-pickup.
            </p>
        </div>
    </div>
</template>

<style scoped>
.delivery-payment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    max-width: 640px;
}

.delivery-payment__hint {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.delivery-payment__field label {
    display: block;
    margin-bottom: 6px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
}
</style>
