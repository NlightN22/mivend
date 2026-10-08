import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductPhoto } from '../entities/product-photo.entity';
import { ProductPhotoSyncService } from '../product-photo-sync.service';
import { MissingDependencyError } from '../types';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Stores `product-photo` metadata only; ProductPhotoSyncService fetches the binary.
// position is a plain int32 (absent = 0, the main photo); every field is consumed except envelope ids.
@Injectable()
export class ProductPhotoStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly syncService: ProductPhotoSyncService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const repo = this.connection.getRepository(ctx, ProductPhoto);
        const existing = await repo.findOne({ where: { externalId: entityId } });

        if (payload.isDeleted === true) {
            if (!existing) {
                return inboundNoop(`product-photo ${entityId}: deleted, no stored row`);
            }
            await repo.update(existing.id, { isDeleted: true });
            await this.syncService.enqueue(existing.productExternalId);
            return;
        }

        const productExternalId = String(payload.productId ?? '');
        const contentHash = String(payload.contentHash ?? '');
        const mimeType = String(payload.mimeType ?? '');
        const downloadUrl = String(payload.downloadUrl ?? '');
        if (!productExternalId || !contentHash || !mimeType) {
            return inboundNoop(`product-photo ${entityId}: incomplete payload, skipping`);
        }
        if (!(await this.productExists(productExternalId))) {
            throw new MissingDependencyError(`product ${productExternalId} not imported yet`);
        }

        const expires = payload.downloadUrlExpiresAt
            ? new Date(String(payload.downloadUrlExpiresAt))
            : null;
        const sameBinary = existing?.contentHash === contentHash;
        await repo.save(
            repo.create({
                ...(existing ? { id: existing.id } : {}),
                externalId: entityId,
                productExternalId,
                contentHash,
                mimeType,
                position: Number(payload.position ?? 0),
                downloadUrl: downloadUrl || null,
                downloadUrlExpiresAt: expires,
                isDeleted: false,
                // A replay of an unchanged binary must not re-download; a new binary must.
                status: !downloadUrl
                    ? 'failed'
                    : sameBinary && existing?.status === 'downloaded'
                      ? 'downloaded'
                      : 'pending',
                assetId: sameBinary ? (existing?.assetId ?? null) : null,
                lastError: downloadUrl ? null : 'no download reference in the event',
            }),
        );
        if (downloadUrl) await this.syncService.enqueue(productExternalId);
    }

    private async productExists(externalId: string): Promise<boolean> {
        const found = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :externalId', { externalId })
            .getRawOne<{ id: string }>();
        return !!found;
    }
}
