<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import MvRoundIconButton from '../MvRoundIconButton/MvRoundIconButton.vue';

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
        <MvRoundIconButton v-if="showUp" aria-label="Scroll to top" title="Scroll to top" @click="scrollToTop">
            ↑
        </MvRoundIconButton>
        <MvRoundIconButton
            v-if="showDown"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            @click="scrollToBottom"
        >
            ↓
        </MvRoundIconButton>
    </div>
</template>

<style scoped>
.mv-scroll-nav {
    position: fixed;
    left: 16px;
    bottom: calc(78px + env(safe-area-inset-bottom));
    z-index: 47;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
