<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

// After this long stuck reconnecting, "still trying" stops being useful information — the
// message escalates to something that sets expectations, and a manual "Log in again" escape
// hatch appears (a full-page navigation to /login, not another retry — the background retry
// loop this bar reflects is already running and unaffected by this button).
const ESCALATE_AFTER_MS = 2 * 60 * 1000;

interface Props {
  since: number | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ relogin: [] }>();

const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 5000);
});
onBeforeUnmount(() => {
  if (tickTimer !== null) clearInterval(tickTimer);
});

const escalated = computed(() => props.since !== null && now.value - props.since >= ESCALATE_AFTER_MS);

const message = computed(() =>
  escalated.value
    ? 'Server unavailable for a while — try again later.'
    : 'Reconnecting to the server…',
);
</script>

<template>
  <Transition name="mv-connection-bar-fade">
    <div class="mv-connection-bar" role="status" aria-live="polite">
      <div class="mv-connection-bar__track">
        <div class="mv-connection-bar__stripe" :class="{ 'mv-connection-bar__stripe--escalated': escalated }" />
      </div>
      <div class="mv-connection-bar__pill" :class="{ 'mv-connection-bar__pill--escalated': escalated }">
        <span>{{ message }}</span>
        <button
          v-if="escalated"
          type="button"
          class="mv-connection-bar__relogin"
          @click="emit('relogin')"
        >
          Log in again
        </button>
      </div>
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
}

.mv-connection-bar__track {
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: rgba(217, 119, 6, 0.15);
  pointer-events: none;
}

.mv-connection-bar__stripe {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, transparent, #d97706, transparent);
  animation: mv-connection-bar-sweep 1.4s ease-in-out infinite;
}

.mv-connection-bar__stripe--escalated {
  background: linear-gradient(90deg, transparent, #dc2626, transparent);
}

.mv-connection-bar__pill {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 14px;
  border-radius: 999px;
  background: #2c3b36;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.mv-connection-bar__pill--escalated {
  background: #7c2d12;
}

.mv-connection-bar__relogin {
  border: none;
  border-radius: 999px;
  padding: 4px 12px;
  background: #fff;
  color: #7c2d12;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mv-connection-bar__relogin:hover {
  filter: brightness(0.95);
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
