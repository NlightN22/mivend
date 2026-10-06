import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { IsNull, LessThan } from 'typeorm';

import { ProductPhoto } from './entities/product-photo.entity';
import { ProductPhotoSyncService } from './product-photo-sync.service';
import { REPLAY_MAX_IDS, ResyncReplayClient } from './resync-replay.client';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export const PHOTO_PENDING_STALE_MS = 60 * 60_000;
export const PHOTO_REPLAY_MIN_INTERVAL_MS = 60 * 60_000;
export const PHOTO_REPLAY_MAX_ATTEMPTS = 5;
const BATCH = 100;

// Self-healing for photos the download job gave up on: stuck `pending` rows are re-queued, and
// `failed` ones (expired link, hash mismatch) get a fresh link by replaying their file id.
@Injectable()
export class ProductPhotoRecoveryService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly syncService: ProductPhotoSyncService,
        private readonly replayClient: ResyncReplayClient,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async recover(ctx: RequestContext): Promise<{ requeued: number; replayed: number }> {
        const requeued = await this.requeueStalePending(ctx);
        const replayed = this.options.kafkaEnabled ? await this.replayFailed(ctx) : 0;
        return { requeued, replayed };
    }

    async replayNow(ctx: RequestContext, id: ID): Promise<ProductPhoto> {
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const photo = await repo.findOneOrFail({ where: { id } });
        await repo.update(photo.id, { replayAttempts: 0 });
        await this.replay(ctx, [photo]);
        return repo.findOneOrFail({ where: { id } });
    }

    private async requeueStalePending(ctx: RequestContext): Promise<number> {
        const cutoff = LessThan(new Date(Date.now() - PHOTO_PENDING_STALE_MS));
        const stale = await this.connection.getRepository(ctx, ProductPhoto).find({
            where: [
                { status: 'pending', isDeleted: false, syncQueuedAt: cutoff },
                { status: 'pending', isDeleted: false, syncQueuedAt: IsNull() },
                { isDeleted: true, syncQueuedAt: cutoff },
            ],
            take: BATCH,
        });
        const productIds = [...new Set(stale.map(p => p.productExternalId))];
        for (const productId of productIds) await this.syncService.enqueue(productId);
        return productIds.length;
    }

    private async replayFailed(ctx: RequestContext): Promise<number> {
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const failed = await repo.find({
            where: { status: 'failed', isDeleted: false },
            take: 500,
        });
        const cutoff = Date.now() - PHOTO_REPLAY_MIN_INTERVAL_MS;
        const due = failed
            .filter(p => p.replayAttempts < PHOTO_REPLAY_MAX_ATTEMPTS)
            .filter(p => !p.lastReplayAt || p.lastReplayAt.getTime() < cutoff)
            .slice(0, REPLAY_MAX_IDS);
        if (due.length === 0) return 0;
        await this.replay(ctx, due);
        return due.length;
    }

    // Attempts are counted before the call so a failing endpoint can't retry the same ids forever.
    private async replay(ctx: RequestContext, photos: ProductPhoto[]): Promise<void> {
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const now = new Date();
        for (const photo of photos) {
            await repo.update(photo.id, {
                replayAttempts: photo.replayAttempts + 1,
                lastReplayAt: now,
            });
        }
        const results = await this.replayClient.replay(
            'productPhoto',
            photos.map(p => p.externalId),
        );
        const notFound = new Set(
            results.filter(r => r.status === 'not_found').map(r => r.entityId),
        );
        for (const photo of photos) {
            if (!notFound.has(photo.externalId)) continue;
            await repo.update(photo.id, {
                replayAttempts: PHOTO_REPLAY_MAX_ATTEMPTS,
                lastError: 'Integration Service no longer knows this photo',
            });
        }
        Logger.log(`Requested replay of ${photos.length} product photo(s)`, loggerCtx);
    }
}
