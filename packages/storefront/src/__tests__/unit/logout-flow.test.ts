import { afterEach, describe, expect, it, vi } from 'vitest';
import { runLogout } from '../../composables/logoutFlow';

afterEach(() => vi.useRealTimers());

function deps(logout: () => Promise<void>) {
    const calls: string[] = [];
    return {
        calls,
        deps: {
            setGuard: () => calls.push('guard'),
            logout: () => {
                calls.push('logout');
                return logout();
            },
            navigate: () => calls.push('navigate'),
        },
    };
}

describe('runLogout', () => {
    it('sets the guard, logs out, then navigates', async () => {
        const d = deps(async () => {});
        await runLogout(d.deps);
        expect(d.calls).toEqual(['guard', 'logout', 'navigate']);
    });

    it('navigates even when the logout request rejects', async () => {
        const d = deps(() => Promise.reject(new Error('offline')));
        await runLogout(d.deps);
        expect(d.calls).toEqual(['guard', 'logout', 'navigate']);
    });

    it('navigates after the timeout when the request hangs', async () => {
        vi.useFakeTimers();
        const d = deps(() => new Promise<void>(() => {}));
        const done = runLogout({ ...d.deps, timeoutMs: 1500 });
        await vi.advanceTimersByTimeAsync(1499);
        expect(d.calls).not.toContain('navigate');
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(d.calls).toEqual(['guard', 'logout', 'navigate']);
    });
});
