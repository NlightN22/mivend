import { onBeforeUnmount, ref, type Ref } from 'vue';

export const REDIRECT_SECONDS = 3;

export function useRedirectCountdown(onDone: () => void): {
    remaining: Ref<number>;
    start: () => void;
} {
    const remaining = ref(REDIRECT_SECONDS);
    let timer: ReturnType<typeof setInterval> | null = null;

    function stop(): void {
        if (timer !== null) clearInterval(timer);
        timer = null;
    }

    function start(): void {
        stop();
        remaining.value = REDIRECT_SECONDS;
        timer = setInterval(() => {
            remaining.value -= 1;
            if (remaining.value <= 0) {
                stop();
                onDone();
            }
        }, 1000);
    }

    onBeforeUnmount(stop);
    return { remaining, start };
}
