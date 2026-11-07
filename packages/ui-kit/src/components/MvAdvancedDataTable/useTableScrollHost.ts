import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useHorizontalScrollFade } from '../../composables/useHorizontalScrollFade';

// PrimeVue owns the scrollable element, so the fade gets a live-DOM getter. `remountKey` is read
// only to make the composable re-attach after the forced remount.
export function useTableScrollHost(containerWidth: Ref<number>, remountKey: Ref<number>) {
    const tableWrapper = ref<HTMLElement | null>(null);
    function getScrollContainer(): HTMLElement | null {
        void remountKey.value;
        return (
            tableWrapper.value?.querySelector<HTMLElement>('.p-datatable-table-container') ?? null
        );
    }
    const { canScrollLeft, canScrollRight, scrollBy } = useHorizontalScrollFade(getScrollContainer);

    let widthObserver: ResizeObserver | null = null;
    watch(tableWrapper, el => {
        widthObserver?.disconnect();
        widthObserver = null;
        if (!el) {
            containerWidth.value = 0;
            return;
        }
        containerWidth.value = el.clientWidth;
        widthObserver = new ResizeObserver(() => (containerWidth.value = el.clientWidth));
        widthObserver.observe(el);
    });
    onBeforeUnmount(() => widthObserver?.disconnect());

    return { tableWrapper, canScrollLeft, canScrollRight, scrollBy };
}
