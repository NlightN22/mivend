<script setup lang="ts">
export type StatusTagVariant =
  | 'in-stock'
  | 'low-stock'
  | 'by-order'
  | 'promo'
  | 'analog'
  | 'original'
  | 'in-cart'
  | 'reserved'
  | 'unavailable';

interface Props {
  variant: StatusTagVariant;
}

defineProps<Props>();

const defaultLabels: Record<StatusTagVariant, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'by-order': 'By order',
  promo: 'Promo',
  analog: 'Analog',
  original: 'Original',
  'in-cart': 'In cart',
  reserved: 'Reserved',
  unavailable: 'Unavailable',
};
</script>

<template>
  <span :class="['mv-status-tag', `mv-status-tag--${variant}`]">
    <slot>{{ defaultLabels[variant] }}</slot>
  </span>
</template>

<style scoped>
.mv-status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--app-radius-sm, 8px);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  line-height: 20px;
}

.mv-status-tag--in-stock    { background: #D1FAE5; color: #065F46; }
.mv-status-tag--low-stock   { background: #FEF3C7; color: #92400E; }
.mv-status-tag--by-order    { background: #E0F2FE; color: #0C4A6E; }
.mv-status-tag--promo       { background: #FEE2E2; color: #991B1B; }
.mv-status-tag--analog      { background: #F3E8FF; color: #6B21A8; }
.mv-status-tag--original    { background: #F0FFFA; color: #065F46; border: 1px solid #00B894; }
.mv-status-tag--in-cart     { background: #FFF3E6; color: #9A4B00; }
.mv-status-tag--reserved    { background: #EDE9FE; color: #4C1D95; }
.mv-status-tag--unavailable { background: #F1F5F9; color: #64748B; }
</style>
