<script setup lang="ts">
export type AmountSize = 'sm' | 'md' | 'lg';

interface Props {
  amount: number;
  currency: string;
  size?: AmountSize;
}

withDefaults(defineProps<Props>(), {
  size: 'md',
});

function formatAmount(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
</script>

<template>
  <span :class="['mv-amount', `mv-amount--${size}`]">
    <span class="mv-amount__value">{{ formatAmount(amount) }}</span>
    <span class="mv-amount__currency">{{ currency }}</span>
  </span>
</template>

<style scoped>
.mv-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  font-weight: 700;
  color: var(--el-text-color-primary, #17212B);
  font-variant-numeric: tabular-nums;
}

.mv-amount--sm {
  font-size: 13px;
}
.mv-amount--sm .mv-amount__currency {
  font-size: 11px;
}

.mv-amount--md {
  font-size: 16px;
}
.mv-amount--md .mv-amount__currency {
  font-size: 13px;
}

.mv-amount--lg {
  font-size: 22px;
}
.mv-amount--lg .mv-amount__currency {
  font-size: 16px;
}

.mv-amount__currency {
  color: var(--el-text-color-secondary, #667085);
  font-weight: 500;
}
</style>
