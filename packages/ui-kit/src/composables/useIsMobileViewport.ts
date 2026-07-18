import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export function useIsMobileViewport(breakpoint = 800): Ref<boolean> {
    const isMobile = ref(false);
    let mql: MediaQueryList | null = null;

    function update(): void {
        isMobile.value = mql?.matches ?? false;
    }

    onMounted(() => {
        mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        update();
        mql.addEventListener('change', update);
    });

    onBeforeUnmount(() => {
        mql?.removeEventListener('change', update);
    });

    return isMobile;
}
