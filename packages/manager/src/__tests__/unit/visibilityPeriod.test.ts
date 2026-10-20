import { describe, expect, it } from 'vitest';
import { describePeriod, periodEndIso, periodStartIso } from '../../utils/visibilityPeriod';

describe('visibility grant period', () => {
    it('an empty day means no bound', () => {
        expect(periodStartIso('')).toBeNull();
        expect(periodEndIso('')).toBeNull();
        expect(describePeriod(null, null)).toBe('Permanent');
    });

    it('the inclusive end day becomes the exclusive next local midnight', () => {
        const start = new Date(periodStartIso('2030-03-10') as string);
        const end = new Date(periodEndIso('2030-03-10') as string);
        expect(start.getDate()).toBe(10);
        expect(end.getDate()).toBe(11);
        expect(end.getHours()).toBe(0);
    });
});
