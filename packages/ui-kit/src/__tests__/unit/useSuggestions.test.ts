import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, ref } from 'vue';
import { useSuggestions } from '../../components/MvFilterBuilder/useSuggestions';
import type { FilterSuggest } from '../../components/MvFilterBuilder/filterBuilderTypes';

function setup(fetcher: FilterSuggest | undefined) {
    let state!: ReturnType<typeof useSuggestions>;
    createApp({
        setup() {
            state = useSuggestions(ref(fetcher));
            return () => null;
        },
    }).mount(document.createElement('div'));
    return state;
}

const key = (name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, cancelable: true });
    return event;
};

describe('useSuggestions', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits 300 ms and ignores a prefix under two characters', async () => {
        const fetcher = vi.fn(async () => ['ab one']);
        const s = setup(fetcher);
        s.query('a');
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetcher).not.toHaveBeenCalled();
        s.query('ab');
        await vi.advanceTimersByTimeAsync(299);
        expect(fetcher).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(fetcher).toHaveBeenCalledWith('ab', expect.any(AbortSignal));
        expect(s.items.value).toEqual(['ab one']);
    });

    it('aborts the stale request and drops its late answer', async () => {
        const signals: AbortSignal[] = [];
        const resolvers: ((v: string[]) => void)[] = [];
        const fetcher: FilterSuggest = (_p, signal) => {
            signals.push(signal);
            return new Promise(resolve => resolvers.push(resolve));
        };
        const s = setup(fetcher);
        s.query('ab');
        await vi.advanceTimersByTimeAsync(300);
        s.query('abc');
        expect(signals[0]!.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(300);
        resolvers[1]!(['abc fresh']);
        await vi.advanceTimersByTimeAsync(0);
        resolvers[0]!(['ab stale']);
        await vi.advanceTimersByTimeAsync(0);
        expect(s.items.value).toEqual(['abc fresh']);
    });

    it('shows at most 10 items and survives a failing request', async () => {
        const many = Array.from({ length: 15 }, (_, i) => `v${i}`);
        const s = setup(vi.fn().mockResolvedValueOnce(many).mockRejectedValueOnce(new Error('x')));
        s.query('ab');
        await vi.advanceTimersByTimeAsync(300);
        expect(s.items.value).toHaveLength(10);
        s.query('abc');
        await vi.advanceTimersByTimeAsync(300);
        expect(s.items.value).toEqual([]);
    });

    it('navigates with arrows, picks with Enter and closes with Escape', async () => {
        const s = setup(async () => ['one', 'two']);
        s.query('ab');
        await vi.advanceTimersByTimeAsync(300);
        const pick = vi.fn();
        const enterBefore = key('Enter');
        expect(s.onKey(enterBefore, pick)).toBe(false);
        expect(enterBefore.defaultPrevented).toBe(false);
        s.onKey(key('ArrowDown'), pick);
        s.onKey(key('ArrowDown'), pick);
        expect(s.active.value).toBe(1);
        s.onKey(key('ArrowDown'), pick);
        expect(s.active.value).toBe(0);
        s.onKey(key('ArrowUp'), pick);
        expect(s.active.value).toBe(1);
        const enter = key('Enter');
        expect(s.onKey(enter, pick)).toBe(true);
        expect(pick).toHaveBeenCalledWith('two');
        expect(enter.defaultPrevented).toBe(true);
        expect(s.items.value).toEqual([]);
        s.query('ab');
        await vi.advanceTimersByTimeAsync(300);
        expect(s.onKey(key('Escape'), pick)).toBe(true);
        expect(s.items.value).toEqual([]);
    });

    it('does nothing without a fetcher', async () => {
        const s = setup(undefined);
        s.query('abc');
        await vi.advanceTimersByTimeAsync(1000);
        expect(s.items.value).toEqual([]);
    });
});
