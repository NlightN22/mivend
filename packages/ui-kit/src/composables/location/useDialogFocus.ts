import { onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
    dialog: Ref<HTMLElement | null>,
    onEscape: () => void,
    enabled = true,
) {
    let opener: HTMLElement | null = null;

    function focusable(): HTMLElement[] {
        return [...(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
            el => !el.hidden,
        );
    }

    function onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            onEscape();
            return;
        }
        if (event.key !== 'Tab' || !dialog.value) return;
        const items = focusable();
        if (!items.length) {
            event.preventDefault();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!dialog.value.contains(active)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    onMounted(() => {
        if (!enabled) return;
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        window.addEventListener('keydown', onKeydown);
        (focusable()[0] ?? dialog.value)?.focus();
    });
    onBeforeUnmount(() => {
        if (!enabled) return;
        window.removeEventListener('keydown', onKeydown);
        opener?.focus();
    });
}
