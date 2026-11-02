import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOT_COMPARABLE_STREAMS, RECONCILED_STREAMS } from '../../reconciled-streams';
import { COMPARED_AGGREGATE_TYPES } from '../../reconciliation-local-counts.service';
import { ALL_INBOUND_STREAMS } from '../../types';

const lists = [RECONCILED_STREAMS, NOT_COMPARABLE_STREAMS];

describe('reconciliation coverage', () => {
    it('every consumed stream has exactly one reconciliation decision', () => {
        for (const stream of ALL_INBOUND_STREAMS) {
            expect(
                lists.filter(l => stream in l),
                stream,
            ).toHaveLength(1);
        }
    });

    it('lists name only consumed streams, with non-empty values', () => {
        for (const list of lists) {
            for (const [stream, value] of Object.entries(list)) {
                expect(ALL_INBOUND_STREAMS as readonly string[]).toContain(stream);
                expect(String(value).trim().length).toBeGreaterThan(0);
            }
        }
    });

    it('every compared aggregate type belongs to exactly one stream', () => {
        expect(Object.values(RECONCILED_STREAMS).sort()).toEqual(
            [...COMPARED_AGGREGATE_TYPES].sort(),
        );
    });

    // A missing referenced entity must be a MissingDependencyError (parked as dependency_missing,
    // not a failed row); a plain Error from a handler would raise the failed-rows alert forever.
    it('no stream handler throws a plain Error for a missing reference', () => {
        const dir = join(__dirname, '../../handlers');
        for (const file of readdirSync(dir).filter(f => f.endsWith('.handler.ts'))) {
            expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/throw new Error\(/);
        }
    });
});
