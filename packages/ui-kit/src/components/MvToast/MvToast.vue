<script setup lang="ts">
import type { NoticeVariant } from '../MvNotice/MvNotice.vue';

withDefaults(defineProps<{ message: string; variant?: NoticeVariant }>(), {
  variant: 'info',
});

defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div :class="['mv-toast', `mv-toast--${variant}`]" role="status">
    <span class="mv-toast__message">{{ message }}</span>
    <button class="mv-toast__close" type="button" aria-label="Dismiss" @click="$emit('dismiss')">
      ×
    </button>
  </div>
</template>

<style scoped>
.mv-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  border-radius: 18px;
  border: 1px solid transparent;
  font-size: 13px;
  line-height: 1.45;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.14);
  min-width: 240px;
  max-width: 360px;
}

.mv-toast--info {
  background: #e2f8ef;
  border-color: rgba(0, 168, 120, 0.18);
  color: #155c48;
}

.mv-toast--success {
  background: #d1fae5;
  border-color: rgba(0, 168, 120, 0.28);
  color: #065f46;
}

.mv-toast--warning {
  background: #fff5df;
  border-color: rgba(255, 138, 0, 0.22);
  color: #573a14;
}

.mv-toast--error {
  background: #fff2f1;
  border-color: rgba(239, 68, 68, 0.2);
  color: #7f1d1d;
}

.mv-toast__message { flex: 1; }

.mv-toast__close {
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  flex-shrink: 0;
}
.mv-toast__close:hover { opacity: 1; }
</style>
