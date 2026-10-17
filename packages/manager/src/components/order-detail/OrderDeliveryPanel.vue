<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { MvButton, MvNotice, MvSelect } from '@mivend/ui-kit';
import { DELIVERY_METHOD_OPTIONS, type DeliveryMethod } from '../../api/orderCreate';
import { setOrderDelivery } from '../../api/orderDelivery';

const props = defineProps<{
    orderId: string;
    shippingCodes: string[];
    tradingPointId: string | null;
    deliveryAddress: string | null;
    points: {
        id: string;
        name: string;
        address: string;
        isActive: boolean;
        customerStatus: string;
    }[];
    canEdit: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const currentMethod = computed<DeliveryMethod>(() =>
    props.shippingCodes.includes('freight-delivery') ? 'courier' : 'pickup',
);
const method = ref<DeliveryMethod>(currentMethod.value);
const pointId = ref(props.tradingPointId ?? '');
const saving = ref(false);
const error = ref('');

const usablePoints = computed(() =>
    props.points.filter(p => p.isActive && p.customerStatus === 'active'),
);
const dirty = computed(
    () =>
        method.value !== currentMethod.value ||
        (method.value === 'courier' && pointId.value !== (props.tradingPointId ?? '')),
);
const canSave = computed(
    () =>
        props.canEdit &&
        dirty.value &&
        !saving.value &&
        (method.value === 'pickup' || !!pointId.value),
);

watch(
    () => [currentMethod.value, props.tradingPointId],
    () => {
        method.value = currentMethod.value;
        pointId.value = props.tradingPointId ?? '';
    },
);

function chooseMethod(value: string): void {
    method.value = value === 'courier' ? 'courier' : 'pickup';
    if (method.value === 'courier' && !pointId.value)
        pointId.value = usablePoints.value[0]?.id ?? '';
}

async function save(): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
        await setOrderDelivery(
            props.orderId,
            method.value,
            method.value === 'courier' ? pointId.value : null,
        );
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not change the delivery';
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <div class="order-delivery">
        <p v-if="!canEdit" class="order-delivery__current">
            {{ currentMethod === 'courier' ? 'Courier delivery' : 'Self-pickup' }}
            <template v-if="deliveryAddress"> — {{ deliveryAddress }}</template>
        </p>
        <template v-else>
            <MvSelect
                :model-value="method"
                :options="[...DELIVERY_METHOD_OPTIONS]"
                :disabled="saving"
                @update:model-value="chooseMethod"
            />
            <MvSelect
                v-if="method === 'courier'"
                :model-value="pointId"
                :options="
                    usablePoints.map(p => ({ value: p.id, label: `${p.name} — ${p.address}` }))
                "
                :disabled="saving"
                @update:model-value="pointId = $event"
            />
            <MvButton :disabled="!canSave" @click="save">Save delivery</MvButton>
        </template>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </div>
</template>

<style scoped>
.order-delivery {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
}

.order-delivery__current {
    margin: 0;
    font-weight: 700;
}
</style>
