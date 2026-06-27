import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { DataSource } from 'typeorm';
import { ImportRunService } from '../../import-run.service';
import type { BatchImportBody } from '../../types';
import type { ImportRun } from '../../entities/import-run.entity';

interface MockRepo {
    findOne: Mock;
    create: Mock;
    save: Mock;
    update: Mock;
}

interface MockErrorRepo {
    create: Mock;
    save: Mock;
}

interface MockDataSource {
    getRepository: Mock;
    _repo: MockRepo;
    _errorRepo: MockErrorRepo;
}

function makeDataSource(): MockDataSource {
    const repo: MockRepo = {
        findOne: vi.fn(),
        create: vi.fn((v: unknown) => v),
        save: vi.fn(async (v: unknown) => ({
            ...(v as object),
            id: 'run-1',
            createdAt: new Date(),
            errors: [],
        })),
        update: vi.fn(async () => ({})),
    };
    const errorRepo: MockErrorRepo = {
        create: vi.fn((v: unknown) => v),
        save: vi.fn(async () => []),
    };
    return {
        getRepository: vi.fn((entity: { name?: string }) => {
            if (entity.name === 'ImportRunError') return errorRepo;
            return repo;
        }),
        _repo: repo,
        _errorRepo: errorRepo,
    };
}

describe('ImportRunService', () => {
    let service: ImportRunService;
    let ds: MockDataSource;

    beforeEach(() => {
        ds = makeDataSource();
        service = new ImportRunService(ds as unknown as DataSource);
    });

    it('findByExchangeId delegates to repository findOne', async () => {
        ds._repo.findOne.mockResolvedValue({ id: 'r1', exchangeId: 'ex1', errors: [] });
        const result = await service.findByExchangeId('ex1');
        expect(result).toMatchObject({ id: 'r1' });
        expect(ds._repo.findOne).toHaveBeenCalledWith({
            where: { exchangeId: 'ex1' },
            relations: ['errors'],
        });
    });

    it('createPending creates run with pending status', async () => {
        const body: BatchImportBody = {
            exchangeId: 'ex2',
            records: [{ type: 'stock', data: { sku: 'A', stockOnHand: 5 } }],
        };
        await service.createPending(body);
        expect(ds._repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'pending', total: 1, exchangeId: 'ex2' }),
        );
        expect(ds._repo.save).toHaveBeenCalled();
    });

    it('toResult maps run to ImportRunResult', () => {
        const run = {
            id: 'r1',
            exchangeId: 'ex1',
            status: 'done',
            total: 2,
            processed: 2,
            failed: 0,
            errors: [],
            payload: {},
            createdAt: new Date('2025-01-01T00:00:00Z'),
            finishedAt: new Date('2025-01-01T00:01:00Z'),
        } as ImportRun;
        const result = service.toResult(run);
        expect(result.runId).toBe('r1');
        expect(result.status).toBe('done');
        expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
        expect(result.finishedAt).toBe('2025-01-01T00:01:00.000Z');
    });

    it('toResult sets finishedAt to null when not finished', () => {
        const run = {
            id: 'r2',
            exchangeId: 'ex2',
            status: 'processing',
            total: 1,
            processed: 0,
            failed: 0,
            errors: [],
            payload: {},
            createdAt: new Date(),
            finishedAt: null,
        } as ImportRun;
        const result = service.toResult(run);
        expect(result.finishedAt).toBeNull();
    });
});
