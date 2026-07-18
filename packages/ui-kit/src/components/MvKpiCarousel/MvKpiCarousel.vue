<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import MvRoundIconButton from '../MvRoundIconButton/MvRoundIconButton.vue';

const track = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let resizeObserver: ResizeObserver | null = null;

function recompute(): void {
    const el = track.value;
    if (!el) return;
    canScrollLeft.value = el.scrollLeft > 4;
    canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function scrollBy(direction: 1 | -1): void {
    const el = track.value;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
}

onMounted(async () => {
    await nextTick();
    recompute();
    track.value?.addEventListener('scroll', recompute, { passive: true });
    resizeObserver = new ResizeObserver(recompute);
    if (track.value) resizeObserver.observe(track.value);
});

onBeforeUnmount(() => {
    track.value?.removeEventListener('scroll', recompute);
    resizeObserver?.disconnect();
});
</script>

<template>
    <div class="mv-kpi-carousel">
        <MvRoundIconButton
            v-if="canScrollLeft"
            :size="36"
            class="mv-kpi-carousel__arrow"
            aria-label="Scroll KPIs left"
            @click="scrollBy(-1)"
        >
            ‹
        </MvRoundIconButton>
        <div class="mv-kpi-carousel__viewport">
            <div ref="track" class="mv-kpi-carousel__track">
                <slot />
            </div>
            <!-- Edge fades signal "more content this way" without the arrow ever sitting on
                 top of a card — the track itself never loses width to make room for an arrow. -->
            <div v-if="canScrollLeft" class="mv-kpi-carousel__fade mv-kpi-carousel__fade--left" />
            <div v-if="canScrollRight" class="mv-kpi-carousel__fade mv-kpi-carousel__fade--right" />
        </div>
        <MvRoundIconButton
            v-if="canScrollRight"
            :size="36"
            class="mv-kpi-carousel__arrow"
            aria-label="Scroll KPIs right"
            @click="scrollBy(1)"
        >
            ›
        </MvRoundIconButton>
    </div>
</template>

<style scoped>
.mv-kpi-carousel {
    display: flex;
    align-items: center;
    gap: 10px;
}

.mv-kpi-carousel__arrow {
    flex: 0 0 auto;
}

.mv-kpi-carousel__viewport {
    position: relative;
    flex: 1;
    min-width: 0;
}

.mv-kpi-carousel__track {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    scrollbar-width: none;
}

.mv-kpi-carousel__track::-webkit-scrollbar {
    display: none;
}

.mv-kpi-carousel__track > :deep(*) {
    flex: 0 0 auto;
    min-width: 180px;
    scroll-snap-align: start;
    overflow: hidden;
}

.mv-kpi-carousel__fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 24px;
    pointer-events: none;
}

.mv-kpi-carousel__fade--left {
    left: 0;
    background: linear-gradient(to right, var(--app-bg, #f6f8fb), transparent);
}

.mv-kpi-carousel__fade--right {
    right: 0;
    background: linear-gradient(to left, var(--app-bg, #f6f8fb), transparent);
}
</style>
