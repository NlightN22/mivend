import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ErpImportService } from '../../erp-import.service';
import type { BatchImportBody, ImportRunResult } from '../../types';
import type { ImportRun } from '../../entities/import-run.entity';

function makeRun(overrides: Partial<ImportRun> = {}): ImportRun {
    return {
        id: 'run-1',
        exchangeId: 'ex-1',
        status: 'processing',
        total: 0,
        processed: 0,
        failed: 0,
        errors: [],
        payload: {},
        createdAt: new Date(),
        finishedAt: null,
        ...overrides,
    } as ImportRun;
}

function makeResult(run: ImportRun): ImportRunResult {
    return {
        runId: run.id,
        status: run.status,
        total: run.total,
        processed: run.processed,
        failed: run.failed,
        errors: [],
        exchangeId: run.exchangeId,
        createdAt: run.createdAt.toISOString(),
        finishedAt: null,
    };
}

interface MockImportRunService {
    findByExchangeId: Mock;
    createPending: Mock;
    markProcessing: Mock;
    complete: Mock;
    toResult: Mock;
}

interface MockHandler {
    upsert: Mock;
}

interface MockAssignHandler {
    assign: Mock;
}

function makeHandler(): MockHandler {
    return { upsert: vi.fn(async () => {}) };
}

function makeAssignHandler(): MockAssignHandler {
    return { assign: vi.fn(async () => {}) };
}

describe('ErpImportService', () => {
    let importRunService: MockImportRunService;
    let productHandler: MockHandler;
    let priceHandler: MockHandler;
    let stockHandler: MockHandler;
    let service: ErpImportService;
    const ctx = {} as RequestContext;

    beforeEach(() => {
        importRunService = {
            findByExchangeId: vi.fn(async () => null),
            createPending: vi.fn(async () => makeRun()),
            markProcessing: vi.fn(async () => {}),
            complete: vi.fn(async () => {}),
            toResult: vi.fn((r: ImportRun) => makeResult(r)),
        };
        productHandler = makeHandler();
        priceHandler = makeHandler();
        stockHandler = makeHandler();
        service = new ErpImportService(
            importRunService as unknown as InstanceType<
                typeof import('../../import-run.service').ImportRunService
            >,
            productHandler as unknown as InstanceType<
                typeof import('../../handlers/product.handler').ProductHandler
            >,
            priceHandler as unknown as InstanceType<
                typeof import('../../handlers/price.handler').PriceHandler
            >,
            stockHandler as unknown as InstanceType<
                typeof import('../../handlers/stock.handler').StockHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/customer.handler').CustomerHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/counterparty.handler').CounterpartyHandler
            >,
            makeAssignHandler() as unknown as InstanceType<
                typeof import('../../handlers/customer-counterparty.handler').CustomerCounterpartyHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/trading-point.handler').TradingPointHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/category.handler').CategoryHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/cross-reference.handler').CrossReferenceHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/discount-rule.handler').DiscountRuleHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/document.handler').DocumentHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/organization-requisites.handler').OrganizationRequisitesHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/department.handler').DepartmentHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/branch.handler').BranchHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/employee.handler').EmployeeHandler
            >,
        );
    });

    it('returns existing run when exchangeId already processed (idempotency)', async () => {
        const existing = makeRun({ status: 'done' });
        importRunService.findByExchangeId.mockResolvedValue(existing);
        const body: BatchImportBody = { exchangeId: 'ex-1', records: [] };
        await service.processBatch(ctx, body);
        expect(importRunService.createPending).not.toHaveBeenCalled();
        expect(importRunService.toResult).toHaveBeenCalledWith(existing);
    });

    it('calls productHandler for product records', async () => {
        const body: BatchImportBody = {
            exchangeId: 'ex-2',
            records: [
                {
                    type: 'product',
                    data: {
                        externalId: 'p1',
                        sku: 'SKU1',
                        name: 'Product',
                        slug: 'product',
                        price: 100,
                        stockOnHand: 10,
                    },
                },
            ],
        };
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));
        await service.processBatch(ctx, body);
        expect(productHandler.upsert).toHaveBeenCalledOnce();
    });

    it('calls priceHandler for price records', async () => {
        const body: BatchImportBody = {
            exchangeId: 'ex-3',
            records: [
                { type: 'price', data: { sku: 'SKU1', priceTypeCode: 'RETAIL', price: 99.9 } },
            ],
        };
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));
        await service.processBatch(ctx, body);
        expect(priceHandler.upsert).toHaveBeenCalledOnce();
    });

    it('calls stockHandler for stock records', async () => {
        const body: BatchImportBody = {
            exchangeId: 'ex-4',
            records: [{ type: 'stock', data: { sku: 'SKU1', stockOnHand: 50 } }],
        };
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));
        await service.processBatch(ctx, body);
        expect(stockHandler.upsert).toHaveBeenCalledOnce();
    });

    it('calls crossReferenceHandler for crossReference records', async () => {
        const crossReferenceHandler = makeHandler();
        service = new ErpImportService(
            importRunService as unknown as InstanceType<
                typeof import('../../import-run.service').ImportRunService
            >,
            productHandler as unknown as InstanceType<
                typeof import('../../handlers/product.handler').ProductHandler
            >,
            priceHandler as unknown as InstanceType<
                typeof import('../../handlers/price.handler').PriceHandler
            >,
            stockHandler as unknown as InstanceType<
                typeof import('../../handlers/stock.handler').StockHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/customer.handler').CustomerHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/counterparty.handler').CounterpartyHandler
            >,
            makeAssignHandler() as unknown as InstanceType<
                typeof import('../../handlers/customer-counterparty.handler').CustomerCounterpartyHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/trading-point.handler').TradingPointHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/category.handler').CategoryHandler
            >,
            crossReferenceHandler as unknown as InstanceType<
                typeof import('../../handlers/cross-reference.handler').CrossReferenceHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/discount-rule.handler').DiscountRuleHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/document.handler').DocumentHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/organization-requisites.handler').OrganizationRequisitesHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/department.handler').DepartmentHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/branch.handler').BranchHandler
            >,
            makeHandler() as unknown as InstanceType<
                typeof import('../../handlers/employee.handler').EmployeeHandler
            >,
        );
        const body: BatchImportBody = {
            exchangeId: 'ex-xref',
            records: [
                {
                    type: 'crossReference',
                    data: {
                        externalId: 'SKF-VKM31023',
                        refs: [{ oemCode: '5013135', oemBrand: 'Ford' }],
                    },
                },
            ],
        };
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));
        await service.processBatch(ctx, body);
        expect(crossReferenceHandler.upsert).toHaveBeenCalledOnce();
    });

    it('records error when handler throws and continues processing', async () => {
        productHandler.upsert.mockRejectedValue(new Error('DB error'));
        const body: BatchImportBody = {
            exchangeId: 'ex-5',
            records: [
                {
                    type: 'product',
                    data: {
                        externalId: 'p1',
                        sku: 'SKU1',
                        name: 'P1',
                        slug: 'p1',
                        price: 10,
                        stockOnHand: 1,
                    },
                },
                { type: 'stock', data: { sku: 'SKU2', stockOnHand: 5 } },
            ],
        };
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));
        await service.processBatch(ctx, body);
        expect(importRunService.complete).toHaveBeenCalledWith(expect.anything(), 1, [
            { index: 0, message: 'DB error' },
        ]);
        expect(stockHandler.upsert).toHaveBeenCalledOnce();
    });

    it('records an unrecognized record type as a per-record error, never silently counts it as processed', async () => {
        const body = {
            exchangeId: 'ex-6',
            records: [
                { type: 'bogusType', data: {} },
                { type: 'stock', data: { sku: 'SKU3', stockOnHand: 5 } },
            ],
        } as unknown as BatchImportBody;
        importRunService.findByExchangeId
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' }));

        await service.processBatch(ctx, body);

        expect(importRunService.complete).toHaveBeenCalledWith(expect.anything(), 1, [
            { index: 0, message: 'Unrecognized record type: "bogusType"' },
        ]);
        expect(stockHandler.upsert).toHaveBeenCalledOnce();
    });
});
