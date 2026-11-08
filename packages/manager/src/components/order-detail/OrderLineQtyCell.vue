<script setup lang="ts">
import { MvQtyStepper } from '@mivend/ui-kit';
import OrderLineUnit from './OrderLineUnit.vue';

defineProps<{
    quantity: number;
    text: string;
    editing: boolean;
    min: number;
    step: number;
    max: number;
    disabled: boolean;
    unit: string;
}>();
defineEmits<{ 'update:quantity': [value: number] }>();
</script>

<template>
    <template v-if="editing">
        <MvQtyStepper
            :model-value="quantity"
            size="sm"
            commit="live"
            :max="max"
            :min="min"
            :step="step"
            :disabled="disabled"
            @update:model-value="$emit('update:quantity', $event)"
        />
        <small v-if="quantity === 0" class="qty-cell__hint">Line will be removed</small>
        <OrderLineUnit :unit="unit" />
    </template>
    <template v-else>
        {{ text }}
        <OrderLineUnit :unit="unit" />
    </template>
</template>

<style scoped>
.qty-cell__hint {
    display: block;
    margin-top: 4px;
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
