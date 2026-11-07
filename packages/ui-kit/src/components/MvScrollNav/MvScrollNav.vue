<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import MvRoundIconButton from '../MvRoundIconButton/MvRoundIconButton.vue';

const props = withDefaults(
    defineProps<{ down?: boolean; upLabel?: string; downLabel?: string }>(),
    { down: true, upLabel: 'Scroll to top', downLabel: 'Scroll to bottom' }
);

const SHOW_UP_THRESHOLD_PX = 400;
const NEAR_BOTTOM_SLACK_PX = 24;

const showUp = ref(false);
const showDown = ref(false);
let observer: MutationObserver | null = null;
let rafPending = false;

function recompute(): void {
    const scrollY = window.scrollY;
    const viewportBottom = scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    showUp.value = scrollY > SHOW_UP_THRESHOLD_PX;
    showDown.value = pageHeight - viewportBottom > NEAR_BOTTOM_SLACK_PX;
}

function scheduleRecompute(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        recompute();
    });
}

function scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom(): void {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

onMounted(() => {
    recompute();
    window.addEventListener('scroll', scheduleRecompute, { passive: true });
    window.addEventListener('resize', scheduleRecompute);
    // Route changes and async data loads resize the page without firing a scroll event —
    // a MutationObserver on body catches that so the buttons don't get stuck stale.
    observer = new MutationObserver(scheduleRecompute);
    observer.observe(document.body, { childList: true, subtree: true });
});

onBeforeUnmount(() => {
    window.removeEventListener('scroll', scheduleRecompute);
    window.removeEventListener('resize', scheduleRecompute);
    observer?.disconnect();
});
</script>

<template>
    <div class="mv-scroll-nav">
        <MvRoundIconButton
            v-if="showUp"
            variant="primary"
            :aria-label="props.upLabel"
            :title="props.upLabel"
            @click="scrollToTop"
        >
            ↑
        </MvRoundIconButton>
        <MvRoundIconButton
            v-if="props.down && showDown"
            variant="primary"
            :aria-label="props.downLabel"
            :title="props.downLabel"
            @click="scrollToBottom"
        >
            ↓
        </MvRoundIconButton>
    </div>
</template>

<style scoped>
.mv-scroll-nav {
    position: fixed;
    right: 16px;
    bottom: calc(var(--mv-scroll-nav-offset, 24px) + env(safe-area-inset-bottom));
    z-index: calc(var(--mv-z-floating) - 1);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

@media (max-width: 800px) {
    .mv-scroll-nav {
        bottom: calc(var(--mv-scroll-nav-offset, 150px) + env(safe-area-inset-bottom));
    }
}
</style>
