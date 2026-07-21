import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ErpImportService } from '../../erp-import.service';
import { TYPE_TO_SCHEMA } from '../../dto/batch-import.dto';
import type { BatchImportBody } from '../../types';
import type { ImportRun } from '../../entities/import-run.entity';

// Contract test for the ERP -> platform REST boundary (POST /erp/import/batch). Unlike
// erp-import.service.test.ts (per-type dispatch behavior) and
// erp-import-run.component.test.ts (real DB accept->process->persist chain), this file targets
// the boundary's own stability guarantees: required envelope fields, every type the DTO
// (batch-import.dto.ts's TYPE_TO_SCHEMA — the Swagger-documented, producer-facing contract)
// declares supported is actually handled by the consumer (ErpImportService.processRecord's
// switch), and an unrecognized type is rejected as a real per-record error rather than silently
// treated as processed (see docs/testing-patterns.md's "Contract compatibility" pattern).
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
    'upsert', // employee
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
    const handlers = HANDLER_METHOD_BY_INDEX.map(method => ({ [method]: vi.fn(async () => {}) }));
    return new (ErpImportService as unknown as new (
        importRunService: unknown,
        ...handlers: unknown[]
    ) => ErpImportService)(importRunService, ...handlers);
}

describe('ERP import batch contract: TYPE_TO_SCHEMA <-> ErpImportService agreement', () => {
    it('has exactly the 15 record types this codebase currently documents (guards against an accidental add/remove going unnoticed)', () => {
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
                'employee',
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

            // processBatch itself is fully mocked here (importRunService.complete is a spy, not
            // real persistence) — assert on what the spy was called with, the same technique
            // erp-import.service.test.ts's "records error" test uses.
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
            0,
            expect.arrayContaining([
                expect.objectContaining({ message: 'Unrecognized record type: "notARealType"' }),
            ]),
        );
    });
});
