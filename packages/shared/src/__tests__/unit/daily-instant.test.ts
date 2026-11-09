import { afterEach, describe, expect, it } from 'vitest';

import { lastDailyInstant } from '../../daily-instant';

const originalTz = process.env.TZ;
const iso = (date: Date): string => date.toISOString();

afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
});

describe('lastDailyInstant', () => {
    it('UTC: today once the hour has passed, yesterday before it', () => {
        process.env.TZ = 'UTC';
        expect(iso(lastDailyInstant(new Date('2026-11-08T10:00:00Z'), 3))).toBe(
            '2026-11-08T03:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-11-08T02:59:59Z'), 3))).toBe(
            '2026-11-07T03:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-03-01T01:00:00Z'), 3))).toBe(
            '2026-02-28T03:00:00.000Z',
        );
    });

    it('Asia/Tokyo (UTC+9): the boundary is 18:00 UTC of the previous day', () => {
        process.env.TZ = 'Asia/Tokyo';
        expect(iso(lastDailyInstant(new Date('2026-11-08T10:00:00Z'), 3))).toBe(
            '2026-11-07T18:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-11-07T17:59:59Z'), 3))).toBe(
            '2026-11-06T18:00:00.000Z',
        );
    });

    it('follows DST in a zone that has it', () => {
        process.env.TZ = 'Europe/Berlin';
        expect(iso(lastDailyInstant(new Date('2026-01-15T12:00:00Z'), 3))).toBe(
            '2026-01-15T02:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-07-15T12:00:00Z'), 3))).toBe(
            '2026-07-15T01:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-03-29T00:30:00Z'), 3))).toBe(
            '2026-03-28T02:00:00.000Z',
        );
    });
});
