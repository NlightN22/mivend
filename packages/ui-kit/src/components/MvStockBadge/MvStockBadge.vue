<script setup lang="ts">
import { computed } from 'vue';
import { STOCK_VARIANT_LABELS, type StockVariant, stockVariantFromQuantity } from './stock-variant';

interface Props {
    variant?: StockVariant;
    label?: string;
    quantity?: number;
}

const props = defineProps<Props>();

const resolvedVariant = computed(
    (): StockVariant =>
        props.quantity !== undefined
            ? stockVariantFromQuantity(props.quantity)
            : (props.variant ?? 'out'),
);

const text = computed(() => {
    if (props.label) return props.label;
    if (props.quantity !== undefined) return `${props.quantity} pcs.`;
    return STOCK_VARIANT_LABELS[resolvedVariant.value];
});
</script>

<template>
    <span :class="['mv-stock-badge', `mv-stock-badge--${resolvedVariant}`]">{{ text }}</span>
</template>

<style scoped>
.mv-stock-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
}

.mv-stock-badge--high {
    background: #e6f9f1;
    color: #00a873;
}
.mv-stock-badge--medium {
    background: #f1f6d8;
    color: #6f8a00;
}
.mv-stock-badge--low {
    background: #fff3e0;
    color: #f57c00;
}
.mv-stock-badge--out {
    background: #f5f5f5;
    color: #b4ccc4;
}
</style>
