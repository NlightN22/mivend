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

// #212/#213: undecodable is a durable column, not derived from lastError — a failed replay
// attempt overwrites lastError, so the signal must not depend on it.
describe('IntegrationInboxReplayService.replayFailed — undecodable rows', () => {
    it('resolves to UNDECODABLE and never calls the replay client', async () => {
        const { service, replayClient, state } = buildService([
            {
                id: 1,
                stream: 'category',
                entityId: 'rejected@0:42',
                status: 'failed',
                undecodable: true,
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
                undecodable: true,
            },
            {
                id: 2,
                stream: 'category',
                entityId: 'cat-7',
                status: 'failed',
                undecodable: false,
            },
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

    // #213 regression: lastError was already overwritten by a prior replay attempt — only the
    // untouched `undecodable` column must still win.
    it('still resolves to UNDECODABLE after an earlier replay attempt overwrote lastError', async () => {
        const { service, replayClient, state } = buildService([
            {
                id: 1,
                stream: 'category',
                entityId: 'rejected@0:42',
                status: 'failed',
                undecodable: true,
                lastError:
                    'replay did not resolve: Integration Service did not accept the replay: not_found',
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
});
