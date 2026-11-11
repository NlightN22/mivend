import { describe, expect, it } from 'vitest';

import { describeDays, describeType, parseDaysInput } from '../../retention-form';

describe('retention form helpers', () => {
    it('names the default row and leaves other types as they are', () => {
        expect(describeType('*')).toBe('Default (all other types)');
        expect(describeType('reservation.expiring')).toBe('reservation.expiring');
    });

    it('shows inherited days as Default', () => {
        expect(describeDays(null)).toBe('Default');
        expect(describeDays(7)).toBe('7 days');
    });

    it('treats empty as inherit on a typed rule and as an error on the default rule', () => {
        expect(parseDaysInput('  ', true)).toEqual({ ok: true, value: null });
        expect(parseDaysInput('', false).ok).toBe(false);
    });

    it('accepts whole days in range and rejects the rest', () => {
        expect(parseDaysInput(' 30 ', false)).toEqual({ ok: true, value: 30 });
        expect(parseDaysInput('3650', true)).toEqual({ ok: true, value: 3650 });
        for (const bad of ['0', '-3', '1.5', 'abc', '3651'])
            expect(parseDaysInput(bad, true).ok, bad).toBe(false);
    });
});
