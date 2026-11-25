import { describe, expect, it } from 'vitest';

import { planRetentionSlice, type RetentionRow } from '../../integration-inbox-retention-slice';

const row = (
    id: string,
    entity: string,
    version: string,
    stream = 'price',
    aged = false,
): RetentionRow => ({
    id,
    stream,
    entity_id: entity,
    version,
    aged,
});

describe('planRetentionSlice', () => {
    it('finishes on an empty slice with no cursor', () => {
        expect(planRetentionSlice([], 3)).toEqual({
            tombstoneIds: [],
            nextCursor: null,
            finished: true,
        });
    });

    it('keeps the numerically newest version per group and tombstones the rest', () => {
        const plan = planRetentionSlice(
            [row('1', 'a', '9'), row('2', 'a', '10'), row('3', 'b', '1')],
            10,
        );
        expect(plan.tombstoneIds).toEqual(['1']);
        expect(plan.finished).toBe(true);
        expect(plan.nextCursor).toBeNull();
    });

    it('holds back the possibly cut last group of a full slice and resumes from the previous key', () => {
        const plan = planRetentionSlice(
            [row('1', 'a', '1'), row('2', 'a', '2'), row('3', 'b', '1')],
            3,
        );
        expect(plan.finished).toBe(false);
        expect(plan.tombstoneIds).toEqual(['1']);
        expect(plan.nextCursor).toEqual({ stream: 'price', entityId: 'a' });
    });

    it('treats the same entity id in different streams as different groups', () => {
        const plan = planRetentionSlice(
            [row('1', 'a', '1', 'price'), row('2', 'a', '1', 'stock')],
            10,
        );
        expect(plan.tombstoneIds).toEqual([]);
    });

    it('still makes progress when one group fills the whole slice', () => {
        const plan = planRetentionSlice(
            [row('1', 'a', '1'), row('2', 'a', '2'), row('3', 'a', '3')],
            3,
        );
        expect(plan.tombstoneIds).toEqual(['1', '2']);
        expect(plan.nextCursor).toEqual({ stream: 'price', entityId: 'a' });
    });

    it('empties the newest row too once it is aged, unless the stream payload is still read', () => {
        const plan = planRetentionSlice(
            [
                row('1', 'a', '1', 'price', true),
                row('2', 'a', '2', 'price', true),
                row('3', 'b', '1', 'price', false),
                row('4', 'w', '1', 'warehouse', true),
            ],
            10,
        );
        expect(plan.tombstoneIds).toEqual(['1', '2']);
    });
});
