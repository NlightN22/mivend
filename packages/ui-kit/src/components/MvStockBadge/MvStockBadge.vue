<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'ok' | 'low' | 'out';
  label?: string;
  quantity?: number;
}

const props = defineProps<Props>();

const DEFAULT_LABELS: Record<'ok' | 'low' | 'out', string> = {
  ok: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

const resolvedVariant = computed((): 'ok' | 'low' | 'out' => {
  if (props.quantity !== undefined) {
    if (props.quantity === 0) return 'out';
    if (props.quantity < 10) return 'low';
    return 'ok';
  }
  return props.variant ?? 'out';
});

const text = computed(() => {
  if (props.label) return props.label;
  if (props.quantity !== undefined) return `${props.quantity} pcs.`;
  return DEFAULT_LABELS[resolvedVariant.value];
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

.mv-stock-badge--ok  { background: #e6f9f1; color: #00a873; }
.mv-stock-badge--low { background: #fff3e0; color: #f57c00; }
.mv-stock-badge--out { background: #f5f5f5; color: #b4ccc4; }
</style>
