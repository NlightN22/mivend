import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

// Tracks whether the chip row can scroll each way and keeps the active chip in view.
export function useChipScroll(
    active: () => string,
    count: () => number,
): {
    row: Ref<HTMLElement | null>;
    canPrev: Ref<boolean>;
    canNext: Ref<boolean>;
    measure: () => void;
    step: (direction: 1 | -1) => void;
} {
    const row = ref<HTMLElement | null>(null);
    const canPrev = ref(false);
    const canNext = ref(false);

    function measure(): void {
        const el = row.value;
        if (!el) return;
        canPrev.value = el.scrollLeft > 1;
        canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    }
    function step(direction: 1 | -1): void {
        row.value?.scrollBy({
            left: direction * (row.value.clientWidth * 0.7),
            behavior: 'smooth',
        });
    }
    function revealActive(): void {
        const el = row.value;
        const chip = el?.querySelector<HTMLElement>('[data-active="true"]');
        if (!el || !chip) return;
        if (
            chip.offsetLeft < el.scrollLeft ||
            chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth
        )
            el.scrollLeft = Math.max(0, chip.offsetLeft - 24);
    }

    let observer: ResizeObserver | undefined;
    onMounted(() => {
        measure();
        revealActive();
        if (typeof ResizeObserver !== 'undefined' && row.value) {
            observer = new ResizeObserver(measure);
            observer.observe(row.value);
        }
    });
    onBeforeUnmount(() => observer?.disconnect());
    watch(
        () => [active(), count()],
        async () => {
            await nextTick();
            revealActive();
            measure();
        },
    );

    return { row, canPrev, canNext, measure, step };
}
