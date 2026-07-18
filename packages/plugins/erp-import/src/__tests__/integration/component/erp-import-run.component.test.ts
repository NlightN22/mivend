import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ImportRun } from '../../../entities/import-run.entity';
import { ImportRunError } from '../../../entities/import-run-error.entity';
import { ImportRunService } from '../../../import-run.service';
import { ErpImportService } from '../../../erp-import.service';
import type { BatchImportBody } from '../../../types';

// Component test for the actual createPending → process each record → persist errors → complete
// chain `make seed` (the only sanctioned way to load dev/test data, per AGENTS.md's "Dev seed
// rules") drives via POST /erp/import/batch. erp-import.service.test.ts already covers per-record-
// type dispatch and basic error recording with a fully mocked ImportRunService (no DB at all) —
// this file targets what mocks can't prove: idempotency by exchangeId backed by ImportRun's real
// unique constraint, a genuine concurrent duplicate-batch race, and a partial-failure batch's
// error rows actually persisted with the right FK and counts.
//
// ImportRun/ImportRunError are plain TypeORM entities (not VendureEntity), so — unlike Order/
// Reservation elsewhere in this codebase — they need no bootstrap-time EntityIdStrategy and can
// be exercised directly against a real Postgres DataSource. The individual catalog handlers
// (ProductHandler, PriceHandler, etc.) DO touch real Vendure entities requiring full bootstrap,
// so they're mocked here — exactly the same "external boundary" substitution reserve-order/
// reservation-expiry's tests use for services outside plugin-erp-import's own ownership.
const mockCtx = {} as RequestContext;

let dataSource: DataSource;
let importRunService: ImportRunService;
let service: ErpImportService;

const { schema, extra } = testSchemaOptions('erp_import_run_component');

function mockHandler(behavior: 'succeed' | 'throw' = 'succeed'): {
    upsert: ReturnType<typeof vi.fn>;
} {
    return {
        upsert:
            behavior === 'succeed'
                ? vi.fn(async () => undefined)
                : vi.fn(async () => {
                      throw new Error('simulated handler failure');
                  }),
    };
}

// ErpImportService's constructor takes importRunService + exactly 15 handlers, in this order:
// product, price, stock, customer, counterparty, customerCounterparty, tradingPoint, category,
// crossReference, discountRule, document, organizationRequisites, department, branch, employee.
const HANDLER_COUNT = 15;
const STOCK_HANDLER_INDEX = 2; // 0-based position of `stock` among the 15 handler args

function buildService(stockHandler: { upsert: ReturnType<typeof vi.fn> }): ErpImportService {
    const handlers = Array.from({ length: HANDLER_COUNT }, (_, i) =>
        i === STOCK_HANDLER_INDEX ? stockHandler : mockHandler('succeed'),
    );
    return new (ErpImportService as unknown as new (
        importRunService: ImportRunService,
        ...handlers: unknown[]
    ) => ErpImportService)(importRunService, ...handlers);
}

function batch(exchangeId: string, count: number): BatchImportBody {
    return {
        exchangeId,
        records: Array.from({ length: count }, (_, i) => ({
            type: 'stock' as const,
            data: { sku: `sku-${i}`, stockOnHand: 10 },
        })),
    };
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [ImportRun, ImportRunError],
        synchronize: true,
    });
    await dataSource.initialize();
    importRunService = new ImportRunService(dataSource);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE erp_import_run_error, erp_import_run CASCADE');
});

describe('ErpImportService + ImportRunService (component, real Postgres)', () => {
    it('a fully successful batch persists a done ImportRun with matching processed/total and no error rows', async () => {
        service = buildService(mockHandler('succeed'));

        const result = await service.processBatch(mockCtx, batch('exchange-1', 3));

        expect(result.status).toBe('done');
        expect(result.total).toBe(3);
        expect(result.processed).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);

        const run = await dataSource
            .getRepository(ImportRun)
            .findOneOrFail({ where: { exchangeId: 'exchange-1' } });
        expect(run.status).toBe('done');
    });

    it('a partially failing batch persists per-record ImportRunError rows with the correct FK and counts', async () => {
        service = buildService(mockHandler('throw'));

        const result = await service.processBatch(mockCtx, batch('exchange-2', 2));

        expect(result.status).toBe('failed'); // every record in this batch was a 'stock' record and all failed
        expect(result.total).toBe(2);
        expect(result.processed).toBe(0);
        expect(result.failed).toBe(2);

        const errors = await dataSource.getRepository(ImportRunError).find({
            relations: ['run'],
        });
        expect(errors).toHaveLength(2);
        expect(errors.every(e => e.run.exchangeId === 'exchange-2')).toBe(true);
        expect(errors.map(e => e.recordIndex).sort()).toEqual([0, 1]);
        expect(errors.every(e => e.message.includes('simulated handler failure'))).toBe(true);
    });

    it('redelivery of the exact same exchangeId is idempotent — returns the existing run, does not reprocess or duplicate rows', async () => {
        service = buildService(mockHandler('succeed'));
        const first = await service.processBatch(mockCtx, batch('exchange-3', 2));

        const secondHandler = mockHandler('succeed');
        const secondService = buildService(secondHandler);
        const second = await secondService.processBatch(mockCtx, batch('exchange-3', 2));

        expect(second.runId).toBe(first.runId);
        expect(secondHandler.upsert).not.toHaveBeenCalled();

        const runs = await dataSource
            .getRepository(ImportRun)
            .find({ where: { exchangeId: 'exchange-3' } });
        expect(runs).toHaveLength(1);
    });

    it('two concurrent submissions of the exact same exchangeId create exactly one ImportRun', async () => {
        const serviceA = buildService(mockHandler('succeed'));
        const serviceB = buildService(mockHandler('succeed'));

        const results = await Promise.allSettled([
            serviceA.processBatch(mockCtx, batch('exchange-4', 1)),
            serviceB.processBatch(mockCtx, batch('exchange-4', 1)),
        ]);

        // findByExchangeId's own check races here (this is a plain find-then-create, not a
        // unique-violation-caught insert like InboxService.enqueue/PaymentAttempt) — the DB's
        // real unique constraint on exchangeId is the actual guard; a loser either errors or
        // (if it reads after the winner commits) returns the winner's row. Either way, exactly
        // one ImportRun for this exchangeId must exist afterward — no silent duplicate.
        const runs = await dataSource
            .getRepository(ImportRun)
            .find({ where: { exchangeId: 'exchange-4' } });
        expect(runs).toHaveLength(1);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });
});
