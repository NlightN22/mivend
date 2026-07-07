import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ProductHandler } from './handlers/product.handler';
import { PriceHandler } from './handlers/price.handler';
import { StockHandler } from './handlers/stock.handler';
import { CustomerHandler } from './handlers/customer.handler';
import { CounterpartyHandler } from './handlers/counterparty.handler';
import { CustomerCounterpartyHandler } from './handlers/customer-counterparty.handler';
import { TradingPointHandler } from './handlers/trading-point.handler';
import { CategoryHandler } from './handlers/category.handler';
import { CrossReferenceHandler } from './handlers/cross-reference.handler';
import { DiscountRuleHandler } from './handlers/discount-rule.handler';
import { DocumentHandler } from './handlers/document.handler';
import { OrganizationRequisitesHandler } from './handlers/organization-requisites.handler';
import { ImportRunService } from './import-run.service';
import type { BatchImportBody, ImportRecord, ImportRunResult } from './types';

const loggerCtx = 'ErpImportService';

@Injectable()
export class ErpImportService {
    constructor(
        private readonly importRunService: ImportRunService,
        private readonly productHandler: ProductHandler,
        private readonly priceHandler: PriceHandler,
        private readonly stockHandler: StockHandler,
        private readonly customerHandler: CustomerHandler,
        private readonly counterpartyHandler: CounterpartyHandler,
        private readonly customerCounterpartyHandler: CustomerCounterpartyHandler,
        private readonly tradingPointHandler: TradingPointHandler,
        private readonly categoryHandler: CategoryHandler,
        private readonly crossReferenceHandler: CrossReferenceHandler,
        private readonly discountRuleHandler: DiscountRuleHandler,
        private readonly documentHandler: DocumentHandler,
        private readonly organizationRequisitesHandler: OrganizationRequisitesHandler,
    ) {}

    async processBatch(ctx: RequestContext, body: BatchImportBody): Promise<ImportRunResult> {
        const existing = await this.importRunService.findByExchangeId(body.exchangeId);
        if (existing) {
            Logger.verbose(
                `Duplicate exchangeId=${body.exchangeId}, returning existing run`,
                loggerCtx,
            );
            return this.importRunService.toResult(existing);
        }

        const run = await this.importRunService.createPending(body);
        await this.importRunService.markProcessing(run);

        const errors: Array<{ index: number; message: string }> = [];
        let processed = 0;

        for (let i = 0; i < body.records.length; i++) {
            const record = body.records[i];
            try {
                await this.processRecord(ctx, record);
                processed++;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                Logger.warn(`Record[${i}] type=${record.type} failed: ${message}`, loggerCtx);
                errors.push({ index: i, message });
            }
        }

        await this.importRunService.complete(run, processed, errors);
        const updated = await this.importRunService.findByExchangeId(body.exchangeId);
        return this.importRunService.toResult(updated!);
    }

    private async processRecord(ctx: RequestContext, record: ImportRecord): Promise<void> {
        switch (record.type) {
            case 'product':
                await this.productHandler.upsert(ctx, record.data);
                break;
            case 'price':
                await this.priceHandler.upsert(ctx, record.data);
                break;
            case 'stock':
                await this.stockHandler.upsert(ctx, record.data);
                break;
            case 'customer':
                await this.customerHandler.upsert(ctx, record.data);
                break;
            case 'counterparty':
                await this.counterpartyHandler.upsert(ctx, record.data);
                break;
            case 'customerCounterparty':
                await this.customerCounterpartyHandler.assign(ctx, record.data);
                break;
            case 'tradingPoint':
                await this.tradingPointHandler.upsert(ctx, record.data);
                break;
            case 'category':
                await this.categoryHandler.upsert(ctx, record.data);
                break;
            case 'crossReference':
                await this.crossReferenceHandler.upsert(ctx, record.data);
                break;
            case 'discountRule':
                await this.discountRuleHandler.upsert(ctx, record.data);
                break;
            case 'document':
                await this.documentHandler.upsert(ctx, record.data);
                break;
            case 'organizationRequisites':
                await this.organizationRequisitesHandler.upsert(ctx, record.data);
                break;
        }
    }
}
