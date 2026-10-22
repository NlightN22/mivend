import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { flatPercentOf, useTierProgressView } from '../../composables/useTierProgressView';

const store = vi.hoisted(() => ({ byVariant: {} as Record<string, unknown>, track: () => {} }));
vi.mock('../../stores/tierProgress', () => ({ useTierProgressStore: () => store }));

describe('flatPercentOf', () => {
    it('derives the flat percent from price and compare-at', () => {
        expect(flatPercentOf(2848, 3560)).toBe(20);
        expect(flatPercentOf(100, null)).toBe(0);
        expect(flatPercentOf(null, 100)).toBe(0);
    });
});

describe('useTierProgressView', () => {
    function view(tp: object, flat: number) {
        store.byVariant = { v1: tp };
        return useTierProgressView(ref('p1'), ref('v1'), ref(flat)).value;
    }
    const base = { facetName: 'b', metric: 'WEIGHT', current: 0, currentPercent: null };

    it('shows the best of flat and reached rung as the current percent', () => {
        const v = view({ ...base, nextThreshold: 300, nextPercent: 16 }, 10);
        expect(v?.currentLabel).toBe('−10%');
    });

    it('shows 0% with no discount at all', () => {
        expect(view({ ...base, nextThreshold: 300, nextPercent: 16 }, 0)?.currentLabel).toBe('0%');
    });

    it('hides the ladder when the next rung is not better than the current discount', () => {
        expect(view({ ...base, nextThreshold: 300, nextPercent: 14 }, 20)).toBeNull();
    });
});
