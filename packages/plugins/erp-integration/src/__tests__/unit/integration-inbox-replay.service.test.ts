import { describe, expect, it, vi } from 'vitest';

import { IntegrationInboxReplayService } from '../../integration-inbox-replay.service';

function buildService(rows: Array<Record<string, unknown>>) {
    const dataSource = {
        getRepository: () => ({
            find: vi.fn().mockResolvedValue(rows),
        }),
    };
    const replayClient = { replay: vi.fn() };
    const state = {
        claimForReplay: vi.fn().mockResolvedValue([]),
        releaseClaim: vi.fn(),
    };
    const service = new IntegrationInboxReplayService(
        dataSource as never,
        replayClient as never,
        state as never,
    );
    return { service, replayClient, state };
}

// #212: an undecodable row's lastError carries the shared `decode failed:` marker
// (kafka-inbound-message.ts) — it must short-circuit before ever reaching Integration Service.
describe('IntegrationInboxReplayService.replayFailed — undecodable rows', () => {
    it('resolves to UNDECODABLE and never calls the replay client', async () => {
        const { service, replayClient, state } = buildService([
            {
                id: 1,
                stream: 'category',
                entityId: 'rejected@0:42',
                status: 'failed',
                lastError: 'decode failed: invalid wire type',
            },
        ]);

        const results = await service.replayFailed([1]);

        expect(results).toEqual([
            {
                id: '1',
                stream: 'category',
                entityId: 'rejected@0:42',
                outcome: 'UNDECODABLE',
                message:
                    'message could not be decoded, no entity id to replay — dismiss it instead',
            },
        ]);
        expect(replayClient.replay).not.toHaveBeenCalled();
        expect(state.claimForReplay).toHaveBeenCalledWith([]);
    });

    it('still replays a sibling failed row with a real decode error unrelated to it', async () => {
        const { service, replayClient, state } = buildService([
            {
                id: 1,
                stream: 'category',
                entityId: 'rejected@0:42',
                status: 'failed',
                lastError: 'decode failed: invalid wire type',
            },
            { id: 2, stream: 'category', entityId: 'cat-7', status: 'failed', lastError: null },
        ]);
        state.claimForReplay.mockResolvedValue([{ id: 2, stream: 'category', entityId: 'cat-7' }]);
        replayClient.replay.mockResolvedValue([{ entityId: 'cat-7', status: 'replayed' }]);

        const results = await service.replayFailed([1, 2]);

        const byId = new Map(results.map(r => [r.id, r]));
        expect(byId.get('1')?.outcome).toBe('UNDECODABLE');
        expect(byId.get('2')?.outcome).toBe('REPLAYED');
        expect(replayClient.replay).toHaveBeenCalledWith('category', ['cat-7']);
        expect(state.claimForReplay).toHaveBeenCalledWith([2]);
    });
});
