import { describe, expect, it, vi } from 'vitest';

import { processStreamBatch } from '../../integration-inbox-batch';
import type { ClaimedInboxEvent } from '../../integration-inbox.service';

const row = (id: number): ClaimedInboxEvent =>
    ({ id, entityId: `e${id}`, claimToken: 't', payload: {} }) as unknown as ClaimedInboxEvent;

describe('processStreamBatch fallback', () => {
    const failingTx = {
        withTransaction: () => Promise.reject(new Error('boom')),
    };

    it('stops the row-by-row fallback at the deadline and returns the rest unprocessed', async () => {
        const processOne = vi.fn().mockResolvedValue(true);
        let calls = 0;
        const result = await processStreamBatch(
            { connection: failingTx as never, inbox: {} as never },
            {} as never,
            'retro-bonus-rule',
            {} as never,
            [row(1), row(2), row(3)],
            processOne,
            () => ++calls > 1,
        );

        expect(processOne).toHaveBeenCalledTimes(1);
        expect(result.processed).toBe(1);
        expect(result.unprocessed.map(r => r.id)).toEqual([2, 3]);
    });
});
