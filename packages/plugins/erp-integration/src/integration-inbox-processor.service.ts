import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService } from '@vendure/core';
import { DataSource } from 'typeorm';

import { CategoryStreamHandler } from './handlers/category.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { DeferredStreamHandler } from './handlers/deferred-stream-handler';
import { DepartmentStreamHandler } from './handlers/department.handler';
import type { InboundStreamHandler } from './handlers/inbound-stream-handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { OrderChangedStreamHandler } from './handlers/order-changed.handler';
import { PromoRuleStreamHandler } from './handlers/promo-rule.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { UserStreamHandler } from './handlers/user.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { IntegrationInboxService } from './integration-inbox.service';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { INBOX_MAX_ATTEMPTS_DEFAULT, MissingDependencyError, loggerCtx } from './types';
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
        priceTypeHandler: PriceTypeStreamHandler,
        stockHandler: StockStreamHandler,
        warehouseHandler: WarehouseStreamHandler,
        organizationHandler: OrganizationStreamHandler,
        departmentHandler: DepartmentStreamHandler,
        counterpartyHandler: CounterpartyStreamHandler,
        counterpartyCreditBalanceHandler: CounterpartyCreditBalanceStreamHandler,
        storageLocationHandler: StorageLocationStreamHandler,
        orderRegistrationResultHandler: OrderRegistrationResultHandler,
        orderChangedHandler: OrderChangedStreamHandler,
        userHandler: UserStreamHandler,
        promoRuleHandler: PromoRuleStreamHandler,
    ) {
        this.handlers = {
            product: productHandler,
            category: categoryHandler,
            price: priceHandler,
            stock: stockHandler,
            organization: organizationHandler,
            warehouse: warehouseHandler,
            department: departmentHandler,
            counterparty: counterpartyHandler,
            'counterparty-credit-balance': counterpartyCreditBalanceHandler,
            'price-type': priceTypeHandler,
            offer: new DeferredStreamHandler('offer'),
            'storage-location': storageLocationHandler,
            'order-registration-result': orderRegistrationResultHandler,
            'order-changed': orderChangedHandler,
            user: userHandler,
            'promo-rule': promoRuleHandler,
            // Quantity dimension deliberately deferred to issue #72 (ATP/reservation-drift
            // source-of-truth); organization_id here is not authoritative — StorageLocationChanged
            // above is the sole source for ProductVariant.customFields.organizationId, so this
            // stream stays a recorded, logged no-op for now, same as `offer`.
            'stock-organization': new DeferredStreamHandler('stock-organization'),
        };
    }

    // `streams`/`batchSize` implement the priority-lane split (issue #93): the critical lane
    // (order-registration-result) and the bulk lane (everything else) each pass their own
    // disjoint stream set and batch size, so a large bulk backlog can never delay a critical row
    // — see integration-inbox.scheduled-task.ts, which owns the two lanes' schedules and the bulk
    // lane's immediate-reclaim-while-full loop.
    async processPendingBatch(
        maxAttempts = INBOX_MAX_ATTEMPTS_DEFAULT,
        streams?: InboundStream[],
        batchSize = 20,
    ): Promise<{
        processed: number;
        failed: number;
        claimed: number;
    }> {
        const rows = await this.inbox.claimBatch(batchSize, streams);
        let processed = 0;
        let failed = 0;
        if (rows.length === 0) return { processed, failed, claimed: 0 };

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
        return { processed, failed, claimed: rows.length };
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
            // Issue #96: a missing cross-entity dependency is an ordinary eventual-consistency
            // race (Kafka gives no cross-topic ordering guarantee), not a processing bug — it
            // gets its own longer backoff-based retry budget instead of markFailed's short/fixed-
            // attempt dead-letter path.
            if (error instanceof MissingDependencyError) {
                await this.inbox.markMissingDependency(row.id, error);
            } else {
                await this.inbox.markFailed(row.id, error, maxAttempts);
            }
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
