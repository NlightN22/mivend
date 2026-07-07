<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value: number;
  max: number;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
});

const percent = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.value / props.max) * 100));
});
</script>

<template>
  <div class="mv-progress-bar">
    <div v-if="label" class="mv-progress-bar__label">{{ label }}</div>
    <div class="mv-progress-bar__track">
      <div class="mv-progress-bar__fill" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.mv-progress-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mv-progress-bar__label {
  font-size: 12px;
  color: #2c3b36;
}

.mv-progress-bar__track {
  height: 6px;
  border-radius: 4px;
  background: #e3efe9;
  overflow: hidden;
}

.mv-progress-bar__fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #00b894, #00a878);
  transition: width 0.25s ease;
}
</style>
