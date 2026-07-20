import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export interface HorizontalScrollFade {
    canScrollLeft: Ref<boolean>;
    canScrollRight: Ref<boolean>;
    scrollBy: (direction: 1 | -1) => void;
    recompute: () => void;
}

/**
 * Drives "more content this way" edge-fade + arrow-button affordance for a horizontally
 * scrollable element that this composable does not own the markup of (e.g. a third-party
 * component's own internal scroll container, like PrimeVue DataTable's `.p-datatable-table-
 * container` — the composable is handed the live element, not asked to render it). Pass a getter
 * so the element can resolve after the owning component mounts/re-mounts.
 */
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
