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

    it('Asia/Krasnoyarsk (UTC+7): the boundary is 20:00 UTC of the previous day', () => {
        process.env.TZ = 'Asia/Krasnoyarsk';
        expect(iso(lastDailyInstant(new Date('2026-11-08T10:00:00Z'), 3))).toBe(
            '2026-11-07T20:00:00.000Z',
        );
        expect(iso(lastDailyInstant(new Date('2026-11-07T19:59:59Z'), 3))).toBe(
            '2026-11-06T20:00:00.000Z',
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
