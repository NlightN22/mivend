import { describe, it, expect } from 'vitest';
import { clampTake } from '../../list-filter-engine';

describe('clampTake', () => {
    it('defaults to 50, keeps 0 as count-only and bounds both ends', () => {
        expect(clampTake(undefined)).toBe(50);
        expect(clampTake(0)).toBe(0);
        expect(clampTake(-1)).toBe(0);
        expect(clampTake(25)).toBe(25);
        expect(clampTake(100000)).toBe(200);
    });
});
