<script setup lang="ts">
export type AmountSize = 'sm' | 'md' | 'lg';

interface Props {
  amount: number;
  currency?: string;
  size?: AmountSize;
  decimals?: number;
}

withDefaults(defineProps<Props>(), {
  currency: 'RUB',
  size: 'md',
  decimals: 0,
});

function formatAmount(value: number, currency: string, decimals: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
</script>

<template>
  <span :class="['mv-amount', `mv-amount--${size}`]">
    {{ formatAmount(amount, currency, decimals) }}
  </span>
</template>

<style scoped>
.mv-amount {
  display: inline-block;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  font-weight: 700;
  color: var(--el-text-color-primary, #14231f);
  font-variant-numeric: tabular-nums;
}

.mv-amount--sm { font-size: 13px; }
.mv-amount--md { font-size: 16px; }
.mv-amount--lg { font-size: 22px; }
</style>
