import { onUnmounted } from 'vue';

// Firing on every keystroke spams the backend and, with PrimeVue filters, re-renders the input
// mid-word and steals focus, so callers must not commit on each input event.
export function useDebouncedCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delayMs = 400,
): (...args: Args) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;

    onUnmounted(() => clearTimeout(timer));

    return (...args: Args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}
