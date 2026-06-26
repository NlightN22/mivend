<script setup lang="ts">
export type NoticeVariant = 'info' | 'warning' | 'success' | 'error';

defineProps<{
  variant?: NoticeVariant;
}>();
</script>

<template>
  <div :class="['mv-notice', `mv-notice--${variant ?? 'info'}`]" role="note">
    <slot />
  </div>
</template>

<style scoped>
.mv-notice {
  padding: 13px 14px;
  border-radius: 18px;
  border: 1px solid transparent;
  font-size: 13px;
  line-height: 1.45;
}

.mv-notice--info {
  background: #e2f8ef;
  border-color: rgba(0, 168, 120, 0.18);
  color: #155c48;
}

.mv-notice--success {
  background: #d1fae5;
  border-color: rgba(0, 168, 120, 0.28);
  color: #065f46;
}

.mv-notice--warning {
  background: #fff5df;
  border-color: rgba(255, 138, 0, 0.22);
  color: #573a14;
}

.mv-notice--error {
  background: #fff2f1;
  border-color: rgba(239, 68, 68, 0.2);
  color: #7f1d1d;
}
</style>
