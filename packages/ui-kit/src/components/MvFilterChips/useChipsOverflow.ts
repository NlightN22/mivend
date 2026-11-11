import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { fitChips } from '../../utils/chipsFit';

export function useChipsOverflow(
    row: Ref<HTMLElement | null>,
    toggle: Ref<{ $el: HTMLElement } | null>,
    watched: () => unknown[],
    activeIndex: () => number,
): { visible: Ref<boolean[] | null>; overflows: Ref<boolean>; hiddenCount: Ref<number> } {
    const visible = ref<boolean[] | null>(null);
    const overflows = ref(false);
    const hiddenCount = ref(0);
    let toggleWidth = 0;
    let observer: ResizeObserver | undefined;

    function measure(): void {
        const el = row.value;
        if (!el) return;
        const chips = Array.from(el.querySelectorAll<HTMLElement>('.mv-filter-chip'));
        const tw = toggle.value?.$el.offsetWidth;
        if (tw) toggleWidth = Math.max(toggleWidth, tw);
        const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
        const fit = fitChips(
            chips.map(c => c.offsetWidth),
            activeIndex(),
            el.clientWidth,
            gap,
            toggleWidth || 90,
        );
        overflows.value = fit.overflows;
        visible.value = fit.visible;
        hiddenCount.value = fit.visible.filter(v => !v).length;
        observer?.disconnect();
        observer?.observe(el);
        chips.forEach(c => observer?.observe(c));
    }

    onMounted(() => {
        if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(measure);
        measure();
    });
    onBeforeUnmount(() => observer?.disconnect());
    watch(watched, async () => {
        await nextTick();
        measure();
    });
    return { visible, overflows, hiddenCount };
}
