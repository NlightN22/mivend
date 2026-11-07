import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocationSearch } from '../../../composables/location/useLocationSearch';

const bias = { latitude: 1, longitude: 2 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
    search: (q: string) => Promise<{ address: string }[]>,
    getMode?: () => 'host-submit',
) {
    return useLocationSearch({
        search: (q, b, p) =>
            p === 'open' && b === bias ? search(q) : Promise.reject(new Error('args')),
        getBias: () => bias,
        getProvider: () => 'open',
        getMode,
    });
}

describe('useLocationSearch', () => {
    it('debounces typing and ignores queries under 3 characters', async () => {
        const fn = vi.fn(async (q: string) => [{ address: q }]);
        const s = setup(fn);
        s.onInput('ab');
        s.onInput('abc');
        s.onInput('abcd');
        await vi.advanceTimersByTimeAsync(400);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('abcd');
        s.onInput('ab');
        expect(s.suggestions.value).toEqual([]);
    });

    it('lets the latest request win when responses arrive out of order', async () => {
        const resolvers: Record<string, (v: { address: string }[]) => void> = {};
        const s = setup(q => new Promise(r => void (resolvers[q] = r)));
        s.onInput('first');
        await vi.advanceTimersByTimeAsync(400);
        s.onInput('second');
        await vi.advanceTimersByTimeAsync(400);
        resolvers.second([{ address: 'second' }]);
        await vi.advanceTimersByTimeAsync(0);
        resolvers.first([{ address: 'first' }]);
        await vi.advanceTimersByTimeAsync(0);
        expect(s.suggestions.value).toEqual([{ address: 'second' }]);
    });

    it('searches immediately on submit and degrades to empty on failure', async () => {
        const s = setup(async () => {
            throw new Error('down');
        });
        s.query.value = 'berlin';
        s.submit();
        await vi.advanceTimersByTimeAsync(0);
        expect(s.failed.value).toBe(true);
        expect(s.suggestions.value).toEqual([]);
    });

    it('waits for Enter or a 1.5 s pause when the provider is submit-only', async () => {
        const fn = vi.fn(async (q: string) => [{ address: q }]);
        const s = setup(fn, () => 'host-submit');
        s.onInput('berlin');
        await vi.advanceTimersByTimeAsync(1400);
        expect(fn).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(150);
        expect(fn).toHaveBeenCalledTimes(1);
        s.onInput('berlin 1');
        s.submit();
        await vi.advanceTimersByTimeAsync(0);
        expect(fn).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
