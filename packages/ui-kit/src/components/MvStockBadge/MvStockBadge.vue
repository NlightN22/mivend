<script setup lang="ts">
interface Props {
  variant: 'ok' | 'low' | 'out';
  label?: string;
}

const props = defineProps<Props>();

const DEFAULT_LABELS: Record<Props['variant'], string> = {
  ok: 'В наличии',
  low: 'Мало',
  out: 'Нет',
};

const text = () => props.label ?? DEFAULT_LABELS[props.variant];
</script>

<template>
  <span :class="['mv-stock-badge', `mv-stock-badge--${variant}`]">{{ text() }}</span>
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
