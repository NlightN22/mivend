import { describe, it, expect, vi } from 'vitest';
import { useLatestRequest } from '../../composables/useLatestRequest';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('useLatestRequest', () => {
    it('applies the result and toggles loading for a single call', async () => {
        const onResult = vi.fn();
        const { run, loading } = useLatestRequest(async () => 'value', onResult);

        const p = run();
        expect(loading.value).toBe(true);
        await p;

        expect(loading.value).toBe(false);
        expect(onResult).toHaveBeenCalledWith('value');
    });

    it('discards an earlier, now-stale response that resolves after a newer call', async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const fetcher = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const onResult = vi.fn();
        const { run } = useLatestRequest(fetcher, onResult);

        const p1 = run();
        const p2 = run();

        // The *second* call's response resolves first (real network jitter) — this must win.
        second.resolve('second-result');
        await p2;
        expect(onResult).toHaveBeenCalledWith('second-result');
        expect(onResult).toHaveBeenCalledTimes(1);

        // The *first* call's response resolves later — must be discarded, not overwrite the
        // already-applied second result.
        first.resolve('first-result-stale');
        await p1;
        expect(onResult).toHaveBeenCalledTimes(1);
        expect(onResult).not.toHaveBeenCalledWith('first-result-stale');
    });

    it('only clears loading once the latest call settles, not an earlier stale one', async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const fetcher = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const { run, loading } = useLatestRequest(fetcher, () => {});

        const p1 = run();
        const p2 = run();
        expect(loading.value).toBe(true);

        // The first (now-stale) call settles before the second — loading must stay true, since
        // the *latest* call is still in flight.
        first.resolve('stale');
        await p1;
        expect(loading.value).toBe(true);

        second.resolve('latest');
        await p2;
        expect(loading.value).toBe(false);
    });
});
