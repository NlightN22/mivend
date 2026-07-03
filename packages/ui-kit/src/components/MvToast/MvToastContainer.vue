<script setup lang="ts">
import MvToast from './MvToast.vue';
import { useToast } from '../../composables/useToast';

const { toasts, dismissToast } = useToast();
</script>

<template>
  <div class="mv-toast-container">
    <TransitionGroup name="mv-toast">
      <MvToast
        v-for="t in toasts"
        :key="t.id"
        :message="t.message"
        :variant="t.variant"
        @dismiss="dismissToast(t.id)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.mv-toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.mv-toast-container :deep(.mv-toast) {
  pointer-events: auto;
}

.mv-toast-move,
.mv-toast-enter-active,
.mv-toast-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.mv-toast-enter-from,
.mv-toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.mv-toast-leave-active {
  position: absolute;
}
</style>
