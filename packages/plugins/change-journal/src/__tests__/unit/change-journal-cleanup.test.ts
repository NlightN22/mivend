import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { sweepChangeJournal } from '../../change-journal-cleanup.scheduled-task';

const ctx = {} as RequestContext;
const now = new Date('2026-11-09T00:00:00Z');

describe('sweepChangeJournal', () => {
    it('deletes in batches until a short batch, with the retention cutoff', async () => {
        const counts = [3, 3, 1];
        const service = { deleteOlderThan: vi.fn(async () => counts.shift() ?? 0) };
        expect(await sweepChangeJournal(service, ctx, 365, now, 3, 10)).toEqual({
            deleted: 7,
            batches: 3,
        });
        expect(service.deleteOlderThan).toHaveBeenCalledWith(
            ctx,
            new Date('2025-11-09T00:00:00Z'),
            3,
        );
    });

    it('stops at the batch bound of one run', async () => {
        const service = { deleteOlderThan: vi.fn(async () => 3) };
        expect(await sweepChangeJournal(service, ctx, 30, now, 3, 4)).toEqual({
            deleted: 12,
            batches: 4,
        });
    });

    it('propagates a failing batch', async () => {
        const service = {
            deleteOlderThan: vi.fn(async () => Promise.reject(new Error('db down'))),
        };
        await expect(sweepChangeJournal(service, ctx, 30, now)).rejects.toThrow('db down');
    });
});
