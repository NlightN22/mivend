import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export interface HorizontalScrollFade {
    canScrollLeft: Ref<boolean>;
    canScrollRight: Ref<boolean>;
    scrollBy: (direction: 1 | -1) => void;
    recompute: () => void;
}

// Element belongs to a third-party component, so it is handed in live, not rendered here.
// Takes a getter because the element may not exist yet or re-mount with its owning component.
export function useHorizontalScrollFade(
    getEl: () => HTMLElement | null | undefined,
): HorizontalScrollFade {
    const canScrollLeft = ref(false);
    const canScrollRight = ref(false);
    let resizeObserver: ResizeObserver | null = null;
    let observedEl: HTMLElement | null = null;

    function recompute(): void {
        const el = getEl();
        if (!el) {
            canScrollLeft.value = false;
            canScrollRight.value = false;
            return;
        }
        canScrollLeft.value = el.scrollLeft > 4;
        canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    }

    function scrollBy(direction: 1 | -1): void {
        const el = getEl();
        if (!el) return;
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
    }

    function attach(): void {
        const el = getEl();
        if (el === observedEl) return;
        if (observedEl) observedEl.removeEventListener('scroll', recompute);
        resizeObserver?.disconnect();
        observedEl = el ?? null;
        if (observedEl) {
            observedEl.addEventListener('scroll', recompute, { passive: true });
            resizeObserver = new ResizeObserver(recompute);
            resizeObserver.observe(observedEl);
        }
        recompute();
    }

    onMounted(attach);
    watch(getEl, attach);

    onBeforeUnmount(() => {
        observedEl?.removeEventListener('scroll', recompute);
        resizeObserver?.disconnect();
    });

    return { canScrollLeft, canScrollRight, scrollBy, recompute };
}
