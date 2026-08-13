import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService } from '@vendure/core';
import type { DataSource } from 'typeorm';

import { CategoryStreamHandler } from './handlers/category.handler';
import { DeferredStreamHandler } from './handlers/deferred-stream-handler';
import type { InboundStreamHandler } from './handlers/inbound-stream-handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { IntegrationInboxService } from './integration-inbox.service';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { INBOX_MAX_ATTEMPTS_DEFAULT, loggerCtx } from './types';
import type { InboundStream } from './types';
import { isVersionNewer } from './version-compare';

// Split from the BullMQ scheduling wiring (integration-inbox.worker.ts) so tests can invoke
// processPendingBatch directly, mirroring IntegrationOutboxProcessorService's own split
// (docs/testing-strategy.md's "Worker testing").
@Injectable()
export class IntegrationInboxProcessorService {
    private readonly handlers: Record<InboundStream, InboundStreamHandler>;

    constructor(
        private readonly dataSource: DataSource,
        private readonly inbox: IntegrationInboxService,
        private readonly requestContextService: RequestContextService,
        productHandler: ProductStreamHandler,
        categoryHandler: CategoryStreamHandler,
        priceHandler: PriceStreamHandler,
        stockHandler: StockStreamHandler,
    ) {
        this.handlers = {
            product: productHandler,
            category: categoryHandler,
            price: priceHandler,
            stock: stockHandler,
            organization: new DeferredStreamHandler('organization'),
            warehouse: new DeferredStreamHandler('warehouse'),
            'price-type': new DeferredStreamHandler('price-type'),
            offer: new DeferredStreamHandler('offer'),
        };
    }

    async processPendingBatch(maxAttempts = INBOX_MAX_ATTEMPTS_DEFAULT): Promise<{
        processed: number;
        failed: number;
    }> {
        const rows = await this.inbox.claimBatch(20);
        let processed = 0;
        let failed = 0;
        if (rows.length === 0) return { processed, failed };

        // claimBatch orders by createdAt (claim fairness), not by (stream, entityId, version) —
        // two versions of the same entity landing in one batch have no guaranteed relative order
        // otherwise. Sorting here before the sequential loop below is what makes the in-batch
        // "already applied a newer version" check in processOne correct, not just the
        // cross-batch/cross-restart DB check (issue #62 review, MEDIUM #1).
        const sorted = [...rows].sort((a, b) => {
            if (a.stream !== b.stream) return a.stream < b.stream ? -1 : 1;
            if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
            if (isVersionNewer(a.version, b.version)) return 1;
            if (isVersionNewer(b.version, a.version)) return -1;
            return 0;
        });

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        for (const row of sorted) {
            const ok = await this.processOne(ctx, row, maxAttempts);
            if (ok) processed += 1;
            else failed += 1;
        }
        return { processed, failed };
    }

    private async processOne(
        ctx: RequestContext,
        row: IntegrationInboxEvent,
        maxAttempts: number,
    ): Promise<boolean> {
        try {
            // Out-of-order guard (issue #62 risk: a lower version arriving after a higher one
            // must not regress state): skip applying (but still mark processed, since this row
            // is not itself invalid — a later duplicate/replay of stale data is expected, not an
            // error) if a newer version for this (stream, entityId) was already processed.
            const isStale = await this.isSupersededByNewerVersion(row);
            if (!isStale) {
                const handler = this.handlers[row.stream];
                await handler.apply(ctx, row.entityId, row.payload);
            } else {
                Logger.verbose(
                    `Skipping stale ${row.stream} entityId=${row.entityId} version=${row.version} (newer version already processed)`,
                    loggerCtx,
                );
            }
            await this.inbox.markProcessed(row.id);
            return true;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            Logger.error(
                `Failed processing ${row.stream} entityId=${row.entityId} (attempt ${row.attempts + 1}): ${error.message}`,
                loggerCtx,
            );
            await this.inbox.markFailed(row.id, error, maxAttempts);
            return false;
        }
    }

    private async isSupersededByNewerVersion(row: IntegrationInboxEvent): Promise<boolean> {
        // `version` is an arbitrary string (see the entity's column comment) — a SQL `>` on a
        // varchar column is lexicographic, wrong for numeric strings of different lengths. Fetch
        // the already-processed candidates for this entity and compare in JS via isVersionNewer
        // (BigInt-safe, string fallback) instead.
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const processedRows = await repo.find({
            where: { stream: row.stream, entityId: row.entityId, status: 'processed' },
        });
        return processedRows.some(processedRow =>
            isVersionNewer(processedRow.version, row.version),
        );
    }
}
