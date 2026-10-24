import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const unmountHooks: Array<() => void> = [];
vi.mock('vue', async () => {
    const actual = await vi.importActual<typeof import('vue')>('vue');
    return { ...actual, onBeforeUnmount: (cb: () => void) => unmountHooks.push(cb) };
});

describe('useRedirectCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        unmountHooks.length = 0;
    });
    afterEach(() => vi.useRealTimers());

    it('counts down once a second and calls onDone exactly once at zero', async () => {
        const { useRedirectCountdown, REDIRECT_SECONDS } =
            await import('../../pages/auth/useRedirectCountdown');
        const onDone = vi.fn();
        const { remaining, start } = useRedirectCountdown(onDone);
        start();
        expect(remaining.value).toBe(REDIRECT_SECONDS);
        vi.advanceTimersByTime(1000);
        expect(remaining.value).toBe(REDIRECT_SECONDS - 1);
        expect(onDone).not.toHaveBeenCalled();
        vi.advanceTimersByTime(10_000);
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('never redirects after unmount', async () => {
        const { useRedirectCountdown } = await import('../../pages/auth/useRedirectCountdown');
        const onDone = vi.fn();
        useRedirectCountdown(onDone).start();
        unmountHooks.forEach(h => h());
        vi.advanceTimersByTime(10_000);
        expect(onDone).not.toHaveBeenCalled();
    });
});
