import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import type { ProductPhoto } from '../../entities/product-photo.entity';
import {
    PHOTO_REPLAY_MAX_ATTEMPTS,
    ProductPhotoRecoveryService,
} from '../../product-photo-recovery.service';

const ctx = {} as RequestContext;
const longAgo = new Date(Date.now() - 3 * 3600_000);

function photo(over: Partial<ProductPhoto>): ProductPhoto {
    return {
        id: over.externalId ?? 'f',
        externalId: 'f',
        productExternalId: 'p-1',
        status: 'failed',
        isDeleted: false,
        replayAttempts: 0,
        lastReplayAt: null,
        ...over,
    } as ProductPhoto;
}

function setup(rows: ProductPhoto[], kafkaEnabled = true, replayStatus = 'replayed_from_state') {
    const repo = {
        find: vi.fn(async (q: { where: { status?: string } | { status?: string }[] }) => {
            const first = Array.isArray(q.where) ? q.where[0] : q.where;
            return rows.filter(r => r.status === first.status);
        }),
        findOneOrFail: vi.fn(async () => rows[0]),
        update: vi.fn(),
    };
    const enqueue = vi.fn();
    const replay = vi.fn(async (_type: string, ids: string[]) =>
        ids.map(entityId => ({ entityId, status: replayStatus })),
    );
    const service = new ProductPhotoRecoveryService(
        { getRepository: () => repo } as never,
        { enqueue } as never,
        { replay } as never,
        { kafkaEnabled } as never,
    );
    return { service, repo, enqueue, replay };
}

describe('ProductPhotoRecoveryService.recover', () => {
    it('re-queues each product with stuck pending photos once', async () => {
        const { service, enqueue } = setup([
            photo({ id: 'a', externalId: 'a', status: 'pending' }),
            photo({ id: 'b', externalId: 'b', status: 'pending' }),
        ]);
        expect(await service.recover(ctx)).toMatchObject({ requeued: 1 });
        expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('replays failed photos by file id and counts the attempt', async () => {
        const { service, replay, repo } = setup([photo({ id: 'a', externalId: 'a' })]);
        await service.recover(ctx);
        expect(replay).toHaveBeenCalledWith('productPhoto', ['a']);
        expect(repo.update).toHaveBeenCalledWith(
            'a',
            expect.objectContaining({ replayAttempts: 1, lastReplayAt: expect.any(Date) }),
        );
    });

    it('skips photos that hit the attempt cap or were replayed recently', async () => {
        const { service, replay } = setup([
            photo({ id: 'a', externalId: 'a', replayAttempts: PHOTO_REPLAY_MAX_ATTEMPTS }),
            photo({ id: 'b', externalId: 'b', lastReplayAt: new Date() }),
        ]);
        await service.recover(ctx);
        expect(replay).not.toHaveBeenCalled();
    });

    it('counts the attempt even when the replay call fails, so it cannot loop forever', async () => {
        const { service, repo, replay } = setup([photo({ id: 'a', externalId: 'a' })]);
        replay.mockRejectedValueOnce(new Error('HTTP 400'));
        await expect(service.recover(ctx)).rejects.toThrow('HTTP 400');
        expect(repo.update).toHaveBeenCalledWith(
            'a',
            expect.objectContaining({ replayAttempts: 1, lastReplayAt: expect.any(Date) }),
        );
    });

    it('replays photos whose last replay is old enough', async () => {
        const { service, replay } = setup([
            photo({ id: 'a', externalId: 'a', replayAttempts: 2, lastReplayAt: longAgo }),
        ]);
        await service.recover(ctx);
        expect(replay).toHaveBeenCalledOnce();
    });

    it('never calls Integration Service when Kafka is disabled for the contour', async () => {
        const { service, replay } = setup([photo({ id: 'a', externalId: 'a' })], false);
        await service.recover(ctx);
        expect(replay).not.toHaveBeenCalled();
    });

    it('stops retrying a photo Integration Service no longer knows', async () => {
        const { service, repo } = setup([photo({ id: 'a', externalId: 'a' })], true, 'not_found');
        await service.recover(ctx);
        expect(repo.update).toHaveBeenCalledWith(
            'a',
            expect.objectContaining({ replayAttempts: PHOTO_REPLAY_MAX_ATTEMPTS }),
        );
    });
});

describe('ProductPhotoRecoveryService.replayNow', () => {
    it('resets the attempt counter and replays regardless of the cap', async () => {
        const { service, replay, repo } = setup([
            photo({ id: 'a', externalId: 'a', replayAttempts: PHOTO_REPLAY_MAX_ATTEMPTS }),
        ]);
        await service.replayNow(ctx, 'a');
        expect(repo.update).toHaveBeenCalledWith('a', { replayAttempts: 0 });
        expect(replay).toHaveBeenCalledWith('productPhoto', ['a']);
    });
});
