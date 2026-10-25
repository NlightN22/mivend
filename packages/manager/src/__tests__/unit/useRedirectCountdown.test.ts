import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { REDIRECT_SECONDS, useRedirectCountdown } from '../../composables/useRedirectCountdown';

function setup(onDone: () => void) {
    const scope = effectScope();
    const api = scope.run(() => useRedirectCountdown(onDone))!;
    return { api, scope };
}

describe('useRedirectCountdown', () => {
    afterEach(() => vi.useRealTimers());

    it('calls onDone once after the countdown', () => {
        vi.useFakeTimers();
        const done = vi.fn();
        const { api } = setup(done);
        api.start();
        vi.advanceTimersByTime((REDIRECT_SECONDS - 1) * 1000);
        expect(done).not.toHaveBeenCalled();
        expect(api.remaining.value).toBe(1);
        vi.advanceTimersByTime(10_000);
        expect(done).toHaveBeenCalledTimes(1);
    });

    it('does not fire after the owner is disposed', () => {
        vi.useFakeTimers();
        const done = vi.fn();
        const { api, scope } = setup(done);
        api.start();
        scope.stop();
        vi.advanceTimersByTime(10_000);
        expect(done).not.toHaveBeenCalled();
    });
});
