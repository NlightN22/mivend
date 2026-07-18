<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

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
        <button
            v-if="canScrollLeft"
            type="button"
            class="mv-kpi-carousel__arrow mv-kpi-carousel__arrow--left"
            aria-label="Scroll KPIs left"
            @click="scrollBy(-1)"
        >
            ‹
        </button>
        <div ref="track" class="mv-kpi-carousel__track">
            <slot />
        </div>
        <button
            v-if="canScrollRight"
            type="button"
            class="mv-kpi-carousel__arrow mv-kpi-carousel__arrow--right"
            aria-label="Scroll KPIs right"
            @click="scrollBy(1)"
        >
            ›
        </button>
    </div>
</template>

<style scoped>
.mv-kpi-carousel {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mv-kpi-carousel__track {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    scrollbar-width: none;
    flex: 1;
    min-width: 0;
}

.mv-kpi-carousel__track::-webkit-scrollbar {
    display: none;
}

.mv-kpi-carousel__track > :deep(*) {
    flex: 0 0 auto;
    min-width: 180px;
    scroll-snap-align: start;
}

.mv-kpi-carousel__arrow {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 50%;
    background: var(--app-surface, #fff);
    color: var(--el-text-color-primary, #17212b);
    font-size: 20px;
    line-height: 1;
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(16, 24, 40, 0.1);
    transition:
        transform 0.14s ease,
        box-shadow 0.14s ease;
}

.mv-kpi-carousel__arrow:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(16, 24, 40, 0.16);
}

.mv-kpi-carousel__arrow:active {
    transform: scale(0.94);
}
</style>
