import { describe, expect, it } from 'vitest';

import { planSplit } from '../../order-line-split';

describe('planSplit', () => {
    it('keeps what fits and records the rest as shortfall', () => {
        expect(planSplit(10, 4, 1)).toEqual({ keep: 4, shortfall: 6 });
    });

    it('keeps whole packs only', () => {
        expect(planSplit(20, 13, 5)).toEqual({ keep: 10, shortfall: 10 });
    });

    it('keeps nothing when less than one pack fits', () => {
        expect(planSplit(20, 4, 5)).toEqual({ keep: 0, shortfall: 20 });
    });

    it('never keeps more than ordered and ignores negative stock', () => {
        expect(planSplit(3, 50, 1)).toEqual({ keep: 3, shortfall: 0 });
        expect(planSplit(3, -2, 1)).toEqual({ keep: 0, shortfall: 3 });
    });
});
