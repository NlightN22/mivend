import { describe, expect, it } from 'vitest';

import {
    AWAITING_UPSTREAM_ENDPOINT,
    NOT_COMPARABLE_STREAMS,
    RECONCILED_STREAMS,
} from '../../reconciled-streams';
import { COMPARED_AGGREGATE_TYPES } from '../../reconciliation-local-counts.service';
import { ALL_INBOUND_STREAMS } from '../../types';

const lists = [RECONCILED_STREAMS, NOT_COMPARABLE_STREAMS, AWAITING_UPSTREAM_ENDPOINT];

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
});
