import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { useDebouncedSearch } from '../../composables/useDebouncedSearch';

describe('useDebouncedSearch', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sends one server request for a burst of typing and exposes its results', async () => {
        const fetcher = vi.fn(async (term: string) => [`hit:${term}`]);
        const { term, results } = useDebouncedSearch(fetcher, [] as string[], 300);

        term.value = 'ak';
        await nextTick();
        term.value = 'aksyu';
        await nextTick();
        await vi.advanceTimersByTimeAsync(300);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('aksyu');
        expect(results.value).toEqual(['hit:aksyu']);
    });

    it('finds a row that a first-page-only list would never contain', async () => {
        const all = Array.from({ length: 24585 }, (_, i) => `company-${i}`);
        const fetcher = vi.fn(async (term: string) =>
            all.filter(n => n.endsWith(term)).slice(0, 20),
        );
        const { term, results } = useDebouncedSearch(fetcher, [] as string[], 300);

        term.value = '-24000';
        await nextTick();
        await vi.advanceTimersByTimeAsync(300);

        expect(results.value).toEqual(['company-24000']);
    });

    it('drops a stale response that arrives after a newer one', async () => {
        const resolvers: Record<string, (v: string[]) => void> = {};
        const fetcher = vi.fn(
            (t: string) => new Promise<string[]>(resolve => (resolvers[t] = resolve)),
        );
        const { term, results } = useDebouncedSearch(fetcher, [] as string[], 100);

        term.value = 'a';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        term.value = 'ab';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        resolvers['ab'](['fresh']);
        await vi.advanceTimersByTimeAsync(0);
        resolvers['a'](['stale']);
        await vi.advanceTimersByTimeAsync(0);

        expect(results.value).toEqual(['fresh']);
    });

    it('clears results and skips the request for an empty term', async () => {
        const fetcher = vi.fn(async () => ['x']);
        const { term, results } = useDebouncedSearch(fetcher, [] as string[], 100);

        term.value = 'a';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        term.value = '  ';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(results.value).toEqual([]);
    });

    it('drops a response that arrives after the term was cleared', async () => {
        let resolve: (v: string[]) => void = () => undefined;
        const fetcher = vi.fn(() => new Promise<string[]>(r => (resolve = r)));
        const { term, results } = useDebouncedSearch(fetcher, [] as string[], 100);

        term.value = 'a';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        term.value = '';
        await nextTick();
        resolve(['late']);
        await vi.advanceTimersByTimeAsync(0);

        expect(results.value).toEqual([]);
    });
});
