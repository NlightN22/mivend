<script setup lang="ts">
import MvButton from '../MvButton/MvButton.vue';

withDefaults(defineProps<{
  title: string;
  message?: string;
  retryLabel?: string;
}>(), {
  message: undefined,
  retryLabel: 'Try again',
});

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="mv-error-state" role="alert">
    <div class="mv-error-state__title">{{ title }}</div>
    <div v-if="message" class="mv-error-state__message">{{ message }}</div>
    <MvButton variant="secondary" @click="emit('retry')">{{ retryLabel }}</MvButton>
  </div>
</template>

<style scoped>
.mv-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  background: var(--app-surface, #fff);
  border: 1px solid var(--app-nav-border, #edf2ef);
  border-radius: var(--app-radius-lg, 16px);
}

.mv-error-state__title {
  font-size: var(--app-font-size-title, 20px);
  font-weight: 800;
  color: var(--app-nav-text-strong, #14231f);
}

.mv-error-state__message {
  font-size: var(--app-font-size-body, 14px);
  color: var(--app-nav-label, #66736e);
  margin-bottom: 8px;
}
</style>
