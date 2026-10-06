import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    AssetService,
    isGraphQlErrorResult,
    JobQueue,
    JobQueueService,
    Logger,
    ProductService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { Readable } from 'stream';
import { IsNull, Not } from 'typeorm';

import { ProductPhoto } from './entities/product-photo.entity';
import {
    downloadVerifiedPhoto,
    PermanentPhotoError,
    photoFileName,
} from './product-photo-download';
import { loggerCtx, MissingDependencyError } from './types';

export const PRODUCT_PHOTO_SYNC_QUEUE = 'product-photo-sync';

interface SyncJobData {
    productExternalId: string;
}

// Downloads pending photos and makes the product's assets mirror its live photos by position.
@Injectable()
export class ProductPhotoSyncService implements OnModuleInit {
    private queue!: JobQueue<SyncJobData>;

    constructor(
        private readonly jobQueueService: JobQueueService,
        private readonly requestContextService: RequestContextService,
        private readonly connection: TransactionalConnection,
        private readonly assetService: AssetService,
        private readonly productService: ProductService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue({
            name: PRODUCT_PHOTO_SYNC_QUEUE,
            process: async job => {
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.syncProduct(ctx, job.data.productExternalId);
            },
        });
    }

    async enqueue(productExternalId: string): Promise<void> {
        await this.queue.add({ productExternalId }, { retries: 3 });
    }

    async syncProduct(ctx: RequestContext, productExternalId: string): Promise<void> {
        const productId = await this.findProductId(productExternalId);
        if (!productId) {
            throw new MissingDependencyError(`product ${productExternalId} not imported yet`);
        }
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const rows = await repo.find({ where: { productExternalId } });
        let transientError: Error | undefined;
        for (const row of rows) {
            if (row.isDeleted || row.status !== 'pending') continue;
            try {
                await this.download(ctx, row);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                if (error instanceof PermanentPhotoError) {
                    await repo.update(row.id, { status: 'failed', lastError: error.message });
                    Logger.warn(`photo ${row.externalId}: ${error.message}`, loggerCtx);
                } else {
                    transientError ??= error;
                }
            }
        }
        await this.attach(ctx, productId, await repo.find({ where: { productExternalId } }));
        if (transientError) throw transientError;
    }

    private async download(ctx: RequestContext, row: ProductPhoto): Promise<void> {
        if (!row.contentHash || !row.mimeType || !row.downloadUrl) {
            throw new PermanentPhotoError('photo event has no download reference');
        }
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const sameBinary = await repo.findOne({
            where: { contentHash: row.contentHash, assetId: Not(IsNull()) },
        });
        if (sameBinary?.assetId) {
            await repo.update(row.id, { status: 'downloaded', assetId: sameBinary.assetId });
            return;
        }
        if (row.downloadUrlExpiresAt && row.downloadUrlExpiresAt.getTime() < Date.now()) {
            throw new PermanentPhotoError('download link expired, replay the photo');
        }
        const body = await downloadVerifiedPhoto(row.downloadUrl, row.contentHash);
        const asset = await this.assetService.createFromFileStream(
            Readable.from(body),
            photoFileName(row.contentHash, row.mimeType),
            ctx,
        );
        if (isGraphQlErrorResult(asset)) throw new PermanentPhotoError(asset.message);
        await repo.update(row.id, { status: 'downloaded', assetId: String(asset.id) });
    }

    private async attach(
        ctx: RequestContext,
        productId: string,
        rows: ProductPhoto[],
    ): Promise<void> {
        const live = rows
            .filter(r => !r.isDeleted && r.status === 'downloaded' && r.assetId)
            .sort((a, b) => a.position - b.position || a.externalId.localeCompare(b.externalId));
        const assetIds = [...new Set(live.map(r => r.assetId as string))];
        await this.productService.update(ctx, {
            id: productId,
            assetIds,
            featuredAssetId: assetIds[0] ?? null,
        });
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const removed = rows.filter(r => r.isDeleted);
        if (removed.length > 0) await repo.remove(removed);
    }

    private async findProductId(externalId: string): Promise<string | undefined> {
        const found = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :externalId', { externalId })
            .getRawOne<{ id: string }>();
        return found ? String(found.id) : undefined;
    }
}
