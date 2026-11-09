import { defaults, types } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { useUtcTimestamps } from '../../pg-utc';

const originalTz = process.env.TZ;

afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
});

describe('useUtcTimestamps', () => {
    it.each(['UTC', 'Asia/Tokyo', 'Europe/Berlin'])(
        'reads and writes UTC wall time under TZ=%s',
        tz => {
            process.env.TZ = tz;
            useUtcTimestamps();
            const parse = types.getTypeParser(1114) as (v: string) => Date;
            expect(parse('2026-11-09 00:00:00.123').toISOString()).toBe('2026-11-09T00:00:00.123Z');
            expect(defaults.parseInputDatesAsUTC).toBe(true);
        },
    );
});
