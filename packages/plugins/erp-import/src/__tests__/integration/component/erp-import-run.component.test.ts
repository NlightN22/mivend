import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
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

// Catalog handlers are mocked: they need full Vendure bootstrap. ImportRun is plain TypeORM,
// so it hits real Postgres, the only way to prove the exchangeId unique constraint holds.
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

// Constructor arguments are positional, so the 15 handlers must be passed in exactly this order.
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
    importRunService = new ImportRunService(createTestConnection(dataSource));
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

        // The find is non-atomic; the unique constraint on exchangeId is the real guard.
        // A losing insert may error or read the winner's row; exactly one ImportRun must remain.
        const runs = await dataSource
            .getRepository(ImportRun)
            .find({ where: { exchangeId: 'exchange-4' } });
        expect(runs).toHaveLength(1);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });
});
