import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { lockAggregates } from 'shared';

import { CategoryStreamHandler } from './handlers/category.handler';
import { ContractStreamHandler } from './handlers/contract.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { DeferredStreamHandler } from './handlers/deferred-stream-handler';
import { DepartmentStreamHandler } from './handlers/department.handler';
import { PositionStreamHandler } from './handlers/position.handler';
import { DiscountRuleStreamHandler } from './handlers/discount-rule.handler';
import { GrantedDiscountStreamHandler } from './handlers/granted-discount.handler';
import { isBatchHandler } from './handlers/inbound-stream-handler';
import type {
    BatchInboundStreamHandler,
    InboundAfterCommit,
    InboundStreamHandler,
} from './handlers/inbound-stream-handler';
import { OrderCancelResultHandler } from './handlers/order-cancel-result.handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { OrderChangedStreamHandler } from './handlers/order-changed.handler';
import { PromoRuleStreamHandler } from './handlers/promo-rule.handler';
import { GrantedRetroBonusStreamHandler } from './handlers/granted-retro-bonus.handler';
import { SettlementBalanceStreamHandler } from './handlers/settlement-balance.handler';
import { SettlementDocumentStreamHandler } from './handlers/settlement-document.handler';
import { OrderStatusStreamHandler } from './handlers/order-status.handler';
import { SettlementDocumentTypeStreamHandler } from './handlers/settlement-document-type.handler';
import { RetroBonusRuleStreamHandler } from './handlers/retro-bonus-rule.handler';
import { PointOfSaleStreamHandler } from './handlers/point-of-sale.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { StockOrganizationStreamHandler } from './handlers/stock-organization.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { ManufacturerStreamHandler } from './handlers/manufacturer.handler';
import { ProductPhotoStreamHandler } from './handlers/product-photo.handler';
import { UnitStreamHandler } from './handlers/unit.handler';
import { BankStreamHandler } from './handlers/bank.handler';
import { BankAccountStreamHandler } from './handlers/bank-account.handler';
import { RegionStreamHandler } from './handlers/region.handler';
import { LegalFormStreamHandler } from './handlers/legal-form.handler';
import { UserStreamHandler } from './handlers/user.handler';
import { VatRateStreamHandler } from './handlers/vat-rate.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { UnknownOrderUuidError } from '@mivend/plugin-reservation';

import { inboxEntityLockKey, processStreamBatch } from './integration-inbox-batch';
import { IntegrationInboxService } from './integration-inbox.service';
import type { ClaimedInboxEvent } from './integration-inbox.service';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { MissingDependencyError, loggerCtx } from './types';
import type { InboundStream } from './types';
import { isVersionNewer } from './version-compare';

// Kept apart from the BullMQ wiring so tests can call processPendingBatch directly.
// Same split as IntegrationOutboxProcessorService (see docs/testing-strategy.md).
@Injectable()
export class IntegrationInboxProcessorService {
    private readonly handlers: Record<InboundStream, InboundStreamHandler>;

    constructor(
        private readonly connection: TransactionalConnection,
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
        positionHandler: PositionStreamHandler,
        counterpartyHandler: CounterpartyStreamHandler,
        counterpartyCreditBalanceHandler: CounterpartyCreditBalanceStreamHandler,
        storageLocationHandler: StorageLocationStreamHandler,
        orderRegistrationResultHandler: OrderRegistrationResultHandler,
        orderChangedHandler: OrderChangedStreamHandler,
        orderCancelResultHandler: OrderCancelResultHandler,
        userHandler: UserStreamHandler,
        promoRuleHandler: PromoRuleStreamHandler,
        vatRateHandler: VatRateStreamHandler,
        pointOfSaleHandler: PointOfSaleStreamHandler,
        contractHandler: ContractStreamHandler,
        unitHandler: UnitStreamHandler,
        manufacturerHandler: ManufacturerStreamHandler,
        regionHandler: RegionStreamHandler,
        legalFormHandler: LegalFormStreamHandler,
        bankHandler: BankStreamHandler,
        bankAccountHandler: BankAccountStreamHandler,
        productPhotoHandler: ProductPhotoStreamHandler,
        discountRuleHandler: DiscountRuleStreamHandler,
        grantedDiscountHandler: GrantedDiscountStreamHandler,
        retroBonusRuleHandler: RetroBonusRuleStreamHandler,
        grantedRetroBonusHandler: GrantedRetroBonusStreamHandler,
        settlementDocumentHandler: SettlementDocumentStreamHandler,
        settlementBalanceHandler: SettlementBalanceStreamHandler,
        settlementDocumentTypeHandler: SettlementDocumentTypeStreamHandler,
        orderStatusHandler: OrderStatusStreamHandler,
        stockOrganizationHandler: StockOrganizationStreamHandler,
    ) {
        this.handlers = {
            product: productHandler,
            category: categoryHandler,
            price: priceHandler,
            stock: stockHandler,
            organization: organizationHandler,
            warehouse: warehouseHandler,
            department: departmentHandler,
            position: positionHandler,
            counterparty: counterpartyHandler,
            'counterparty-credit-balance': counterpartyCreditBalanceHandler,
            'price-type': priceTypeHandler,
            offer: new DeferredStreamHandler('offer'),
            'storage-location': storageLocationHandler,
            'order-registration-result': orderRegistrationResultHandler,
            'order-changed': orderChangedHandler,
            'order-cancel-result': orderCancelResultHandler,
            user: userHandler,
            'promo-rule': promoRuleHandler,
            'vat-rate': vatRateHandler,
            'point-of-sale': pointOfSaleHandler,
            contract: contractHandler,
            unit: unitHandler,
            manufacturer: manufacturerHandler,
            region: regionHandler,
            'legal-form': legalFormHandler,
            bank: bankHandler,
            'bank-account': bankAccountHandler,
            'product-photo': productPhotoHandler,
            'discount-rule': discountRuleHandler,
            'granted-discount': grantedDiscountHandler,
            'retro-bonus-rule': retroBonusRuleHandler,
            'granted-retro-bonus': grantedRetroBonusHandler,
            'settlement-document': settlementDocumentHandler,
            'settlement-balance': settlementBalanceHandler,
            'settlement-document-type': settlementDocumentTypeHandler,
            'order-status': orderStatusHandler,
            'stock-organization': stockOrganizationHandler,
        };
    }

    // Lanes use disjoint stream sets and batch sizes so a bulk backlog cannot delay critical rows.
    // deadlineMs bounds the loop; rows not reached are released back to pending.
    async processPendingBatch(
        streams?: InboundStream[],
        batchSize = 20,
        deadlineMs?: number,
    ): Promise<{
        processed: number;
        failed: number;
        claimed: number;
    }> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const rows = await this.inbox.claimBatch(ctx, batchSize, streams);
        let processed = 0;
        let failed = 0;
        if (rows.length === 0) return { processed, failed, claimed: 0 };

        // claimBatch orders by createdAt, so two versions of one entity in a batch have no guaranteed order.
        // Sorting here makes the in-batch version check in processOne correct, not just the DB check.
        const sorted = [...rows].sort((a, b) => {
            if (a.stream !== b.stream) return a.stream < b.stream ? -1 : 1;
            if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
            if (isVersionNewer(a.version, b.version)) return 1;
            if (isVersionNewer(b.version, a.version)) return -1;
            return 0;
        });

        const batchGroups = new Map<InboundStream, ClaimedInboxEvent[]>();
        const singles: ClaimedInboxEvent[] = [];
        for (const row of sorted) {
            if (!isBatchHandler(this.handlers[row.stream])) {
                singles.push(row);
                continue;
            }
            const group = batchGroups.get(row.stream) ?? [];
            group.push(row);
            batchGroups.set(row.stream, group);
        }

        const unprocessed: ClaimedInboxEvent[] = [];
        const pastDeadline = (): boolean => deadlineMs !== undefined && Date.now() >= deadlineMs;
        for (const [stream, group] of batchGroups) {
            if (pastDeadline()) {
                unprocessed.push(...group);
                continue;
            }
            const counts = await processStreamBatch(
                { connection: this.connection, inbox: this.inbox },
                ctx,
                stream,
                this.handlers[stream] as BatchInboundStreamHandler,
                group,
                row => this.processOne(ctx, row),
            );
            processed += counts.processed;
            failed += counts.failed;
        }
        for (let i = 0; i < singles.length; i++) {
            if (pastDeadline()) {
                unprocessed.push(...singles.slice(i));
                break;
            }
            const ok = await this.processOne(ctx, singles[i]);
            if (ok) processed += 1;
            else failed += 1;
        }
        if (unprocessed.length > 0) {
            Logger.warn(
                `processPendingBatch: deadline reached mid-batch, releasing ${unprocessed.length} claimed row(s) back to pending`,
                loggerCtx,
            );
            await this.inbox.releaseClaims(
                ctx,
                unprocessed.map(row => row.id),
                unprocessed[0].claimToken,
            );
        }
        return { processed, failed, claimed: rows.length };
    }

    private async processOne(ctx: RequestContext, row: ClaimedInboxEvent): Promise<boolean> {
        try {
            // Handler writes and the processed mark commit together; a throw rolls both back.
            const afterCommit = await this.connection.withTransaction(ctx, txCtx =>
                this.applyAndSettle(txCtx, row),
            );
            await this.runAfterCommit(ctx, row, afterCommit);
            return true;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const message = `Failed processing ${row.stream} entityId=${row.entityId} (attempt ${row.attempts + 1}): ${error.message}`;
            if (error instanceof MissingDependencyError) Logger.warn(message, loggerCtx);
            else Logger.error(message, loggerCtx);
            // Issue #211: an order uuid unknown to this instance resolves as a noop once the
            // usual retry budget is exhausted, instead of dead-lettering forever.
            const onBudgetExhausted =
                error instanceof UnknownOrderUuidError
                    ? { outcome: 'noop' as const, reason: 'unknown order uuid' }
                    : null;
            // ctx holds no transaction, so this runs after the handler's rollback, on its own.
            await this.inbox.markFailed(
                ctx,
                row.id,
                error,
                Math.random,
                onBudgetExhausted,
                row.claimToken,
            );
            return false;
        }
    }

    // The row is already processed: a failed action is logged and left to its own recovery sweep.
    private async runAfterCommit(
        ctx: RequestContext,
        row: ClaimedInboxEvent,
        actions: InboundAfterCommit[],
    ): Promise<void> {
        for (const action of actions) {
            try {
                await action(ctx);
            } catch (err) {
                Logger.error(
                    `After-commit action for ${row.stream} entityId=${row.entityId} failed: ${err instanceof Error ? err.message : String(err)}`,
                    loggerCtx,
                );
            }
        }
    }

    private async applyAndSettle(
        ctx: RequestContext,
        row: ClaimedInboxEvent,
    ): Promise<InboundAfterCommit[]> {
        const handler = this.handlers[row.stream];
        // Batch-capable streams share the batch path's entity lock, so a row-by-row retry cannot race a batch.
        if (isBatchHandler(handler)) {
            await lockAggregates(this.connection, ctx, [
                inboxEntityLockKey(row.stream, row.entityId),
            ]);
        }
        // A lower version arriving after a higher one must not regress state.
        // Such rows are still marked processed: stale replays are expected, not errors.
        if (await this.isSupersededByNewerVersion(ctx, row)) {
            Logger.verbose(
                `Skipping stale ${row.stream} entityId=${row.entityId} version=${row.version} (newer version already processed)`,
                loggerCtx,
            );
            await this.inbox.markProcessed(
                ctx,
                row.id,
                'superseded',
                'a newer version was already processed',
                row.claimToken,
            );
            return [];
        }
        const result = await handler.apply(ctx, row.entityId, row.payload);
        if (result && result.kind === 'noop') {
            await this.inbox.markProcessed(ctx, row.id, 'noop', result.reason, row.claimToken);
        } else {
            await this.inbox.markProcessed(ctx, row.id, 'applied', null, row.claimToken);
        }
        return result?.afterCommit ?? [];
    }

    private async isSupersededByNewerVersion(
        ctx: RequestContext,
        row: IntegrationInboxEvent,
    ): Promise<boolean> {
        // Compared in JS (isVersionNewer): SQL `>` on the varchar version is lexicographic.
        // Only `version` is selected — never the jsonb payload of every historical row.
        const repo = this.connection.getRepository(ctx, IntegrationInboxEvent);
        const processedRows = await repo.find({
            select: { version: true },
            where: { stream: row.stream, entityId: row.entityId, status: 'processed' },
        });
        return processedRows.some(processedRow =>
            isVersionNewer(processedRow.version, row.version),
        );
    }
}
