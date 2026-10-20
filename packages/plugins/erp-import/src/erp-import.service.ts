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
import { DepartmentHandler } from './handlers/department.handler';
import { PositionHandler } from './handlers/position.handler';
import { OrderStatusHandler } from './handlers/order-status.handler';
import { DepartmentBranchHandler } from './handlers/department-branch.handler';
import { BranchHandler } from './handlers/branch.handler';
import { EmployeeHandler } from './handlers/employee.handler';
import { WarehouseHandler } from './handlers/warehouse.handler';
import { StockOrganizationHandler } from './handlers/stock-organization.handler';
import { StorageLocationHandler } from './handlers/storage-location.handler';
import { ContractHandler } from './handlers/contract.handler';
import { ManufacturerHandler } from './handlers/manufacturer.handler';
import { SettlementHandler } from './handlers/settlement.handler';
import { ImportRunService } from './import-run.service';
import type { ImportRun } from './entities/import-run.entity';
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
        private readonly departmentHandler: DepartmentHandler,
        private readonly branchHandler: BranchHandler,
        private readonly departmentBranchHandler: DepartmentBranchHandler,
        private readonly employeeHandler: EmployeeHandler,
        private readonly positionHandler: PositionHandler,
        private readonly orderStatusHandler: OrderStatusHandler,
        private readonly warehouseHandler: WarehouseHandler,
        private readonly contractHandler: ContractHandler,
        private readonly stockOrganizationHandler: StockOrganizationHandler,
        private readonly storageLocationHandler: StorageLocationHandler,
        private readonly manufacturerHandler: ManufacturerHandler,
        private readonly settlementHandler: SettlementHandler,
    ) {}

    async processBatch(ctx: RequestContext, body: BatchImportBody): Promise<ImportRunResult> {
        const existing = await this.importRunService.findByExchangeId(ctx, body.exchangeId);
        if (existing && existing.status !== 'failed') {
            Logger.verbose(
                `Duplicate exchangeId=${body.exchangeId}, returning existing run`,
                loggerCtx,
            );
            return this.importRunService.toResult(existing);
        }

        let run: ImportRun;
        if (existing) {
            Logger.verbose(`Retrying previously failed exchangeId=${body.exchangeId}`, loggerCtx);
            await this.importRunService.resetForRetry(ctx, existing);
            run = existing;
        } else {
            run = await this.importRunService.createPending(ctx, body);
        }
        await this.importRunService.markProcessing(ctx, run);

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

        if (body.records.some(record => record.type === 'category')) {
            await this.categoryHandler.recomputeFilters(ctx);
        }

        await this.importRunService.complete(ctx, run, processed, errors);
        const updated = await this.importRunService.findByExchangeId(ctx, body.exchangeId);
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
            case 'department':
                await this.departmentHandler.upsert(ctx, record.data);
                break;
            case 'position':
                await this.positionHandler.upsert(ctx, record.data);
                break;
            case 'departmentBranch':
                await this.departmentBranchHandler.upsert(ctx, record.data);
                break;
            case 'branch':
                await this.branchHandler.upsert(ctx, record.data);
                break;
            case 'employee':
                await this.employeeHandler.upsert(ctx, record.data);
                break;
            case 'warehouse':
                await this.warehouseHandler.upsert(ctx, record.data);
                break;
            case 'contract':
                await this.contractHandler.upsert(ctx, record.data);
                break;
            case 'orderStatus':
                await this.orderStatusHandler.upsert(ctx, record.data);
                break;
            case 'stockOrganization':
                await this.stockOrganizationHandler.upsert(ctx, record.data);
                break;
            case 'storageLocation':
                await this.storageLocationHandler.upsert(ctx, record.data);
                break;
            case 'manufacturer':
                await this.manufacturerHandler.upsert(ctx, record.data);
                break;
            case 'settlementDocument':
                await this.settlementHandler.upsertDocument(ctx, record.data);
                break;
            case 'settlementBalance':
                await this.settlementHandler.upsertBalance(ctx, record.data);
                break;
            case 'settlementDocumentType':
                await this.settlementHandler.upsertDocumentType(ctx, record.data);
                break;
            default:
                // No global ValidationPipe validates `type`; an unknown type falls through the switch silently.
                // Unapplied records must be per-record errors in errors[], never counted as processed.
                throw new Error(`Unrecognized record type: "${(record as { type: string }).type}"`);
        }
    }
}
