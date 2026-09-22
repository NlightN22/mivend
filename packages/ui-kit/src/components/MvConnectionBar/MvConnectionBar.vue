<script setup lang="ts">
interface Props {
  message?: string;
}

withDefaults(defineProps<Props>(), {
  message: 'Reconnecting to the server…',
});
</script>

<template>
  <Transition name="mv-connection-bar-fade">
    <div class="mv-connection-bar" role="status" aria-live="polite">
      <div class="mv-connection-bar__track">
        <div class="mv-connection-bar__stripe" />
      </div>
      <div class="mv-connection-bar__pill">{{ message }}</div>
    </div>
  </Transition>
</template>

<style scoped>
/* Fixed to the viewport, not the page flow — a background reconnect must stay visible no matter
   how far the user has scrolled, and must never push page content down (a static in-page notice
   both fails to do). Sits above the topbar's own sticky z-index (20, MvAppTopbar) so it's never
   hidden behind it. */
.mv-connection-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.mv-connection-bar__track {
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: rgba(217, 119, 6, 0.15);
}

.mv-connection-bar__stripe {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, transparent, #d97706, transparent);
  animation: mv-connection-bar-sweep 1.4s ease-in-out infinite;
}

.mv-connection-bar__pill {
  margin-top: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: #2c3b36;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

@keyframes mv-connection-bar-sweep {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.mv-connection-bar-fade-enter-active,
.mv-connection-bar-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mv-connection-bar-fade-enter-from,
.mv-connection-bar-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mv-connection-bar__stripe {
    animation: none;
  }
}
</style>
