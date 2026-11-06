<script setup lang="ts">
import { computed } from 'vue';
import {
    STOCK_VARIANT_LABELS,
    type StockBadgeLabels,
    type StockVariant,
    stockVariantFromQuantity,
} from './stock-variant';

interface Props {
    variant?: StockVariant;
    label?: string;
    quantity?: number;
    labels?: Partial<StockBadgeLabels>;
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
    if (props.quantity !== undefined) {
        return props.labels?.pieces?.(props.quantity) ?? `${props.quantity} pcs.`;
    }
    return props.labels?.[resolvedVariant.value] ?? STOCK_VARIANT_LABELS[resolvedVariant.value];
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
    background: var(--app-stock-in-bg);
    color: var(--app-stock-in-fg);
}
.mv-stock-badge--medium {
    background: var(--app-stock-mid-bg);
    color: var(--app-stock-mid-fg);
}
.mv-stock-badge--low {
    background: var(--app-stock-low-bg);
    color: var(--app-stock-low-fg);
}
.mv-stock-badge--out {
    background: var(--app-stock-none-bg);
    color: var(--app-text-disabled);
}
</style>
