<script setup lang="ts">
import { computed } from 'vue';
import { deriveLinePricing, type LinePricingInput } from '../utils/linePricing';

const props = withDefaults(
    defineProps<{
        line: LinePricingInput;
        currency: string;
        kind: 'unit' | 'total';
        unitFactor?: number;
    }>(),
    { unitFactor: 1 },
);

const pricing = computed(() => deriveLinePricing(props.line));
const current = computed(() =>
    props.kind === 'unit' ? pricing.value.unit * props.unitFactor : pricing.value.total,
);
const old = computed(() => {
    if (props.kind !== 'unit') return pricing.value.oldTotal;
    const oldUnit = pricing.value.oldUnit;
    return oldUnit == null ? oldUnit : oldUnit * props.unitFactor;
});
const decimals = computed(() => (props.kind === 'unit' ? 2 : 0));
</script>

<template>
    <div :class="['line-price', `line-price--${kind}`]">
        <span class="line-price__label">{{ kind === 'unit' ? 'Price' : 'Total' }}</span>
        <MvAmountDisplay
            v-if="old != null"
            :amount="old"
            :currency="currency"
            :decimals="decimals"
            size="sm"
            class="line-price__old"
        />
        <MvAmountDisplay
            :amount="current"
            :currency="currency"
            :decimals="decimals"
            size="sm"
            :class="kind === 'total' ? 'line-price__total' : 'line-price__unit'"
        />
    </div>
</template>

<style scoped>
.line-price {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    white-space: nowrap;
}
.line-price__label {
    display: none;
    color: #66736e;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
}
.line-price__total {
    font-size: 19px !important;
    font-weight: 950 !important;
    color: #008a64 !important;
}
.line-price__unit {
    font-size: 15px !important;
    font-weight: 800 !important;
}
.line-price__old {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #a8b8b2 !important;
    text-decoration: line-through;
}
@media (max-width: 900px) {
    .line-price__label {
        display: block;
    }
}
</style>
