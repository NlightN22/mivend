<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import ConnectedProductCard from './ConnectedProductCard.vue';
import type { ProductItem } from '../composables/useProductList';

const props = defineProps<{
    title: string;
    items: ProductItem[];
    loading: boolean;
}>();

const viewport = ref<HTMLElement | null>(null);
const canPrev = ref(false);
const canNext = ref(false);

function measure(): void {
    const el = viewport.value;
    if (!el) return;
    canPrev.value = el.scrollLeft > 1;
    canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

function scrollByPage(dir: 1 | -1): void {
    const el = viewport.value;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
}

const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);

async function attach(): Promise<void> {
    await nextTick();
    resizeObserver?.disconnect();
    if (viewport.value) resizeObserver?.observe(viewport.value);
    measure();
}

watch(() => [props.loading, props.items.length], attach);
onMounted(attach);
onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
    <section v-if="loading || items.length > 0" class="psr">
        <h2 class="psr-title">{{ title }}</h2>
        <div v-if="loading" class="psr-state">{{ $t('common.loading') }}</div>
        <div v-else class="psr-wrap">
            <button
                v-if="canPrev"
                class="psr-arrow psr-arrow--left"
                :aria-label="$t('common.previous')"
                @click="scrollByPage(-1)"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                        d="M12.5 15L7.5 10L12.5 5"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>

            <div ref="viewport" class="psr-viewport" @scroll.passive="measure">
                <ConnectedProductCard
                    v-for="p in items"
                    :key="p.id"
                    class="psr-card"
                    :item="p"
                    mode="card"
                />
            </div>

            <button
                v-if="canNext"
                class="psr-arrow psr-arrow--right"
                :aria-label="$t('common.next')"
                @click="scrollByPage(1)"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                        d="M7.5 5L12.5 10L7.5 15"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>
    </section>
</template>

<style scoped>
.psr {
    margin-bottom: 40px;
}

.psr-title {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #14231f;
}

.psr-wrap {
    position: relative;
}

.psr-arrow {
    display: none;
}

@media (hover: hover) and (pointer: fine) {
    .psr-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
        color: #14231f;
        cursor: pointer;
        transition:
            background 0.15s,
            box-shadow 0.15s,
            color 0.15s;
    }

    .psr-arrow:hover {
        background: #2db87a;
        color: #fff;
        box-shadow: 0 4px 16px rgba(45, 184, 122, 0.35);
    }

    .psr-arrow--left {
        left: 4px;
    }
    .psr-arrow--right {
        right: 4px;
    }
}

.psr-viewport {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
}

.psr-viewport::-webkit-scrollbar {
    display: none;
}

.psr-card {
    flex: 0 0 220px;
    scroll-snap-align: start;
}

.psr-state {
    height: 60px;
    display: flex;
    align-items: center;
    color: #a8b8b2;
    font-size: 14px;
}
</style>
