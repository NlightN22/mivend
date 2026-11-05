import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])';

export function useFocusTrap(container: Ref<HTMLElement | null>, active: Ref<boolean>): void {
    let opener: HTMLElement | null = null;

    function items(): HTMLElement[] {
        return Array.from(container.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    }

    function onKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Tab') return;
        const list = items();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        const current = document.activeElement;
        const outside = !container.value?.contains(current);
        if (event.shiftKey && (current === first || outside)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (current === last || outside)) {
            event.preventDefault();
            first.focus();
        }
    }

    watch(
        active,
        async isActive => {
            if (isActive) {
                opener = document.activeElement as HTMLElement | null;
                document.addEventListener('keydown', onKeydown);
                await nextTick();
                items()[0]?.focus();
            } else {
                document.removeEventListener('keydown', onKeydown);
                opener?.focus();
                opener = null;
            }
        },
        { flush: 'post' },
    );

    onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
