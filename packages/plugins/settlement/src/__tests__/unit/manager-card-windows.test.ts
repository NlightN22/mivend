import { describe, expect, it } from 'vitest';

import { managerCardPeriods, shiftMonths } from '../../manager-card.windows';

describe('manager card periods', () => {
    const p = managerCardPeriods(new Date('2026-11-17T12:00:00Z'), 'UTC');

    it('compares 30 days with the 30 before', () => {
        expect(p.last30).toEqual({ from: '2026-10-19', to: '2026-11-17' });
        expect(p.prev30).toEqual({ from: '2026-09-19', to: '2026-10-18' });
    });

    it('compares month to date with the same days a month and a year back', () => {
        expect(p.mtd).toEqual({ from: '2026-11-01', to: '2026-11-17' });
        expect(p.prevMonth).toEqual({ from: '2026-10-01', to: '2026-10-17' });
        expect(p.prevYearMonth).toEqual({ from: '2025-11-01', to: '2025-11-17' });
    });

    it('compares year to date with the same days of the previous year', () => {
        expect(p.ytd).toEqual({ from: '2026-01-01', to: '2026-11-17' });
        expect(p.prevYtd).toEqual({ from: '2025-01-01', to: '2025-11-17' });
        expect(p.last12).toEqual({ from: '2025-11-18', to: '2026-11-17' });
    });

    it('clamps to the end of a shorter month', () => {
        expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
        expect(shiftMonths('2024-02-29', -12)).toBe('2023-02-28');
    });

    it('uses the local calendar day of the zone', () => {
        const late = managerCardPeriods(new Date('2026-11-17T22:30:00Z'), 'Asia/Tokyo');
        expect(late.today).toBe('2026-11-18');
    });
});
