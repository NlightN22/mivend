<script setup lang="ts">
import { computed } from 'vue';
import MvTooltip from '../MvTooltip/MvTooltip.vue';

export interface DiscountTier {
    percent: number;
    minWeightKg: number | null;
    minAmount: number | null;
}

interface Props {
    tiers?: DiscountTier[];
    size?: 'sm' | 'md';
    // Copy is caller-supplied (not hardcoded here) so ui-kit stays locale-agnostic —
    // same pattern as MvSearchInput's buttonLabel prop.
    title?: string;
    weightLabel?: (kg: number) => string;
    amountLabel?: (minorUnits: number) => string;
}

const props = withDefaults(defineProps<Props>(), {
    tiers: () => [],
    size: 'md',
    title: 'Volume discount',
    weightLabel: (kg: number) => `≥ ${kg.toLocaleString()} kg`,
    amountLabel: (minorUnits: number) => `≥ ${(minorUnits / 100).toLocaleString()} ₽`,
});

const maxPercent = computed(() => Math.max(0, ...props.tiers.map(t => t.percent)));

function formatThreshold(tier: DiscountTier): string {
    if (tier.minWeightKg !== null) {
        return props.weightLabel(tier.minWeightKg);
    }
    if (tier.minAmount !== null) {
        return props.amountLabel(tier.minAmount);
    }
    return '';
}
</script>

<template>
    <MvTooltip v-if="tiers.length > 0" placement="bottom" class="mv-discount-badge-wrap">
        <template #trigger>
            <button type="button" :class="['mv-discount-badge', `mv-discount-badge--${size}`]">
                −{{ maxPercent }}%
            </button>
        </template>
        <div class="mv-discount-badge__title">{{ title }}</div>
        <ul class="mv-discount-badge__list">
            <li v-for="(tier, i) in tiers" :key="i">
                {{ formatThreshold(tier) }} — <strong>−{{ tier.percent }}%</strong>
            </li>
        </ul>
    </MvTooltip>
</template>

<style scoped>
.mv-discount-badge-wrap {
    display: inline-flex;
}

.mv-discount-badge {
    display: inline-flex;
    align-items: center;
    border: none;
    border-radius: 8px;
    background: #ff4d4f;
    color: #fff;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 4px 10px rgba(255, 77, 79, 0.3);
}

.mv-discount-badge--md {
    padding: 4px 8px;
    font-size: 11px;
}

.mv-discount-badge--sm {
    padding: 2px 6px;
    font-size: 10px;
}

.mv-discount-badge__title {
    font-weight: 800;
    margin-bottom: 4px;
    color: #14231f;
}

.mv-discount-badge__list {
    margin: 0;
    padding-left: 16px;
}

.mv-discount-badge__list li {
    margin-bottom: 2px;
}
</style>
