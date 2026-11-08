import { describe, expect, it } from 'vitest';

import { lastResetInstant } from '../../reset-instant';

const iso = (date: Date): string => date.toISOString();

describe('lastResetInstant', () => {
    it('is today at the hour once the local hour has passed', () => {
        expect(iso(lastResetInstant(new Date('2026-11-08T10:00:00Z'), 3, 'UTC'))).toBe(
            '2026-11-08T03:00:00.000Z',
        );
    });

    it('is yesterday before the local hour', () => {
        expect(iso(lastResetInstant(new Date('2026-11-08T02:59:59Z'), 3, 'UTC'))).toBe(
            '2026-11-07T03:00:00.000Z',
        );
    });

    it('uses the zone, winter offset', () => {
        expect(iso(lastResetInstant(new Date('2026-01-15T12:00:00Z'), 3, 'Europe/Berlin'))).toBe(
            '2026-01-15T02:00:00.000Z',
        );
    });

    it('uses the zone, summer offset', () => {
        expect(iso(lastResetInstant(new Date('2026-07-15T12:00:00Z'), 3, 'Europe/Berlin'))).toBe(
            '2026-07-15T01:00:00.000Z',
        );
    });

    it('follows the DST change day: 03:00 local is 01:00 UTC after the spring switch', () => {
        expect(iso(lastResetInstant(new Date('2026-03-29T12:00:00Z'), 3, 'Europe/Berlin'))).toBe(
            '2026-03-29T01:00:00.000Z',
        );
        expect(iso(lastResetInstant(new Date('2026-03-29T00:30:00Z'), 3, 'Europe/Berlin'))).toBe(
            '2026-03-28T02:00:00.000Z',
        );
    });

    it('follows the autumn switch and a zone behind UTC', () => {
        expect(iso(lastResetInstant(new Date('2026-10-25T12:00:00Z'), 3, 'Europe/Berlin'))).toBe(
            '2026-10-25T02:00:00.000Z',
        );
        expect(iso(lastResetInstant(new Date('2026-11-08T12:00:00Z'), 3, 'America/New_York'))).toBe(
            '2026-11-08T08:00:00.000Z',
        );
    });

    it('crosses a month boundary backwards', () => {
        expect(iso(lastResetInstant(new Date('2026-03-01T01:00:00Z'), 3, 'UTC'))).toBe(
            '2026-02-28T03:00:00.000Z',
        );
    });
});
