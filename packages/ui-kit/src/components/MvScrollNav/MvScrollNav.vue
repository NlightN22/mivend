<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-vue';
import MvRoundIconButton from '../MvRoundIconButton/MvRoundIconButton.vue';
import { useUiLabels } from '../../utils/uiLabels';

const props = withDefaults(
    defineProps<{ down?: boolean; upLabel?: string; downLabel?: string }>(),
    { down: true, upLabel: undefined, downLabel: undefined },
);

const SHOW_UP_THRESHOLD_PX = 400;
const label = useUiLabels();
const upText = computed(() => props.upLabel ?? label('scrollToTop', 'Scroll to top'));
const downText = computed(() => props.downLabel ?? label('scrollToBottom', 'Scroll to bottom'));
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
        <div class="mv-scroll-nav__slot" :class="{ 'mv-scroll-nav__slot--hidden': !showUp }">
            <MvRoundIconButton
                variant="primary"
                :aria-label="upText"
                :title="upText"
                :tabindex="showUp ? 0 : -1"
                @click="scrollToTop"
            >
                <IconArrowUp :size="22" stroke="2.25" aria-hidden="true" />
            </MvRoundIconButton>
        </div>
        <div
            v-if="props.down"
            class="mv-scroll-nav__slot"
            :class="{ 'mv-scroll-nav__slot--hidden': !showDown }"
        >
            <MvRoundIconButton
                variant="primary"
                :aria-label="downText"
                :title="downText"
                :tabindex="showDown ? 0 : -1"
                @click="scrollToBottom"
            >
                <IconArrowDown :size="22" stroke="2.25" aria-hidden="true" />
            </MvRoundIconButton>
        </div>
    </div>
</template>

<style scoped>
.mv-scroll-nav {
    pointer-events: none;
    position: fixed;
    right: 16px;
    bottom: calc(var(--mv-scroll-nav-offset, 24px) + env(safe-area-inset-bottom));
    z-index: calc(var(--mv-z-floating) - 1);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* Each arrow has its own fixed slot: showing or hiding one never moves the other. */
.mv-scroll-nav__slot {
    pointer-events: auto;
}

.mv-scroll-nav__slot--hidden {
    visibility: hidden;
    pointer-events: none;
}

@media (max-width: 800px) {
    .mv-scroll-nav {
        bottom: calc(var(--mv-scroll-nav-offset, 150px) + env(safe-area-inset-bottom));
    }
}
</style>
