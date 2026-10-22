import { describe, expect, it } from 'vitest';

import { isStale } from '../access/harness/stale-sweep';

const now = Date.UTC(2026, 9, 22, 12);
const hours = (h: number): number => now - h * 60 * 60 * 1000;

describe('access run stale sweep', () => {
    it('treats only access runs older than 6 hours as stale', () => {
        expect(isStale(`mivend_access_${hours(7)}_123`, now)).toBe(true);
        expect(isStale(`mivend_access_${hours(1)}_123`, now)).toBe(false);
    });

    it('never matches other names', () => {
        for (const name of [
            'mivend',
            'mivend_central',
            `mivend_access_${hours(7)}`,
            `x_mivend_access_${hours(7)}_1`,
            '/',
        ])
            expect(isStale(name, now)).toBe(false);
    });
});
