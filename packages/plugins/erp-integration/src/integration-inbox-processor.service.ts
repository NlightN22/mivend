import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService } from '@vendure/core';
import { DataSource } from 'typeorm';

import { CategoryStreamHandler } from './handlers/category.handler';
import { ContractStreamHandler } from './handlers/contract.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { DeferredStreamHandler } from './handlers/deferred-stream-handler';
import { DepartmentStreamHandler } from './handlers/department.handler';
import { PositionStreamHandler } from './handlers/position.handler';
import { DiscountRuleStreamHandler } from './handlers/discount-rule.handler';
import { GrantedDiscountStreamHandler } from './handlers/granted-discount.handler';
import type { InboundStreamHandler } from './handlers/inbound-stream-handler';
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

import { IntegrationInboxService } from './integration-inbox.service';
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
            // organization_id here is not authoritative: StorageLocationChanged is the sole source for
            // ProductVariant.customFields.organizationId, so this stream is a logged no-op (like offer).
            'stock-organization': new DeferredStreamHandler('stock-organization'),
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
        const rows = await this.inbox.claimBatch(batchSize, streams);
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

        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        let stoppedAt = sorted.length;
        for (let i = 0; i < sorted.length; i++) {
            if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
                stoppedAt = i;
                break;
            }
            const ok = await this.processOne(ctx, sorted[i]);
            if (ok) processed += 1;
            else failed += 1;
        }
        if (stoppedAt < sorted.length) {
            const unprocessedIds = sorted.slice(stoppedAt).map(row => row.id);
            Logger.warn(
                `processPendingBatch: deadline reached mid-batch, releasing ${unprocessedIds.length} claimed row(s) back to pending`,
                loggerCtx,
            );
            await this.inbox.releaseClaims(unprocessedIds);
        }
        return { processed, failed, claimed: rows.length };
    }

    private async processOne(ctx: RequestContext, row: IntegrationInboxEvent): Promise<boolean> {
        try {
            // A lower version arriving after a higher one must not regress state.
            // Such rows are still marked processed: stale replays are expected, not errors.
            const isStale = await this.isSupersededByNewerVersion(row);
            if (isStale) {
                Logger.verbose(
                    `Skipping stale ${row.stream} entityId=${row.entityId} version=${row.version} (newer version already processed)`,
                    loggerCtx,
                );
                await this.inbox.markProcessed(
                    row.id,
                    'superseded',
                    'a newer version was already processed',
                );
                return true;
            }
            const result = await this.handlers[row.stream].apply(ctx, row.entityId, row.payload);
            if (result && result.kind === 'noop') {
                await this.inbox.markProcessed(row.id, 'noop', result.reason);
            } else {
                await this.inbox.markProcessed(row.id);
            }
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
            await this.inbox.markFailed(row.id, error, undefined, onBudgetExhausted);
            return false;
        }
    }

    private async isSupersededByNewerVersion(row: IntegrationInboxEvent): Promise<boolean> {
        // Compared in JS (isVersionNewer): SQL `>` on the varchar version is lexicographic.
        // Only `version` is selected — never the jsonb payload of every historical row.
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const processedRows = await repo.find({
            select: { version: true },
            where: { stream: row.stream, entityId: row.entityId, status: 'processed' },
        });
        return processedRows.some(processedRow =>
            isVersionNewer(processedRow.version, row.version),
        );
    }
}
