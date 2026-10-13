import { describe, expect, it } from 'vitest';

import { toMinorUnits } from '../../amount';

describe('toMinorUnits', () => {
    it.each([
        [3505.7, 350570],
        [0, 0],
        [-12.34, -1234],
        [0.1 + 0.2, 30],
        [1.005, 101],
        [-1.005, -101],
        [100000000.99, 10000000099],
    ])('%s -> %s', (major, minor) => {
        expect(toMinorUnits(major)).toBe(minor);
    });

    it('rejects a non-finite amount instead of storing garbage', () => {
        expect(() => toMinorUnits(Number.NaN)).toThrow();
        expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow();
    });
});
