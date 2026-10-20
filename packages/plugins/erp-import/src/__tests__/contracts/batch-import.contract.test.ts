import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ErpImportService } from '../../erp-import.service';
import { TYPE_TO_SCHEMA } from '../../dto/batch-import.dto';
import type { BatchImportBody } from '../../types';
import type { ImportRun } from '../../entities/import-run.entity';

// Every TYPE_TO_SCHEMA type is the producer-facing contract: processRecord must handle each.
// Unknown types must fail as per-record errors, never be silently counted as processed.
const ctx = {} as RequestContext;

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

// Handler constructor order for ErpImportService (see its constructor) — customerCounterparty
// is the one handler with an `assign` method instead of `upsert`, everything else is `upsert`.
const HANDLER_METHOD_BY_INDEX = [
    'upsert', // product
    'upsert', // price
    'upsert', // stock
    'upsert', // customer
    'upsert', // counterparty
    'assign', // customerCounterparty
    'upsert', // tradingPoint
    'upsert', // category
    'upsert', // crossReference
    'upsert', // discountRule
    'upsert', // document
    'upsert', // organizationRequisites
    'upsert', // department
    'upsert', // branch
    'upsert', // departmentBranch
    'upsert', // employee
    'upsert', // position
    'upsert', // warehouse
    'upsert', // contract
    'upsert', // orderStatus
    'upsert', // stockOrganization
    'upsert', // storageLocation
    'upsert', // manufacturer
] as const;

function buildService(): ErpImportService {
    const importRunService = {
        findByExchangeId: vi
            .fn<() => Promise<ImportRun | null>>()
            .mockResolvedValueOnce(null)
            .mockResolvedValue(makeRun({ status: 'done' })),
        createPending: vi.fn(async () => makeRun()),
        markProcessing: vi.fn(async () => {}),
        complete: vi.fn(async () => {}),
        toResult: vi.fn((r: ImportRun) => ({
            runId: r.id,
            status: r.status,
            total: r.total,
            processed: r.processed,
            failed: r.failed,
            errors: [],
            exchangeId: r.exchangeId,
            createdAt: r.createdAt.toISOString(),
            finishedAt: null,
        })),
    };
    const handlers = HANDLER_METHOD_BY_INDEX.map(method => ({
        [method]: vi.fn(async () => {}),
        recomputeFilters: vi.fn(async () => {}),
    }));
    return new (ErpImportService as unknown as new (
        importRunService: unknown,
        ...handlers: unknown[]
    ) => ErpImportService)(importRunService, ...handlers);
}

describe('ERP import batch contract: TYPE_TO_SCHEMA <-> ErpImportService agreement', () => {
    it('has exactly the 23 record types this codebase currently documents (guards against an accidental add/remove going unnoticed)', () => {
        expect(Object.keys(TYPE_TO_SCHEMA).sort()).toEqual(
            [
                'product',
                'price',
                'stock',
                'customer',
                'counterparty',
                'customerCounterparty',
                'tradingPoint',
                'category',
                'crossReference',
                'discountRule',
                'document',
                'organizationRequisites',
                'department',
                'branch',
                'departmentBranch',
                'employee',
                'position',
                'warehouse',
                'contract',
                'orderStatus',
                'stockOrganization',
                'storageLocation',
                'manufacturer',
            ].sort(),
        );
    });

    it.each(Object.keys(TYPE_TO_SCHEMA))(
        'every producer-declared type "%s" is actually handled by the consumer, never rejected as unrecognized',
        async type => {
            const service = buildService();
            const result = await service.processBatch(ctx, {
                exchangeId: `contract-${type}`,
                records: [{ type, data: {} }],
            } as unknown as BatchImportBody);

            // processBatch is fully mocked, so complete is a spy: assert on its call arguments, not stored state.
            const completeMock = (
                service as unknown as {
                    importRunService: { complete: ReturnType<typeof vi.fn> };
                }
            ).importRunService.complete;
            const [, , errors] = completeMock.mock.calls[0] as [unknown, number, unknown[]];
            expect(errors).not.toEqual([
                expect.objectContaining({
                    message: expect.stringContaining('Unrecognized record type'),
                }),
            ]);
            void result;
        },
    );

    it('an unrecognized type not in TYPE_TO_SCHEMA is rejected as a per-record error, never silently counted as processed', async () => {
        const service = buildService();
        await service.processBatch(ctx, {
            exchangeId: 'contract-unknown',
            records: [{ type: 'notARealType', data: {} }],
        } as unknown as BatchImportBody);

        const completeMock = (
            service as unknown as { importRunService: { complete: ReturnType<typeof vi.fn> } }
        ).importRunService.complete;
        expect(completeMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            0,
            expect.arrayContaining([
                expect.objectContaining({ message: 'Unrecognized record type: "notARealType"' }),
            ]),
        );
    });
});
