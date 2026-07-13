import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { DepartmentService } from '../../department.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        find: vi.fn(async () => [] as unknown[]),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('DepartmentService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: DepartmentService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        service = new DepartmentService(connection as unknown as TransactionalConnection);
    });

    it('creates a new department when no row matches the erpId', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, { erpId: 'dept-sales', name: 'Sales' });
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 'dept-sales', name: 'Sales', parentErpId: null }),
        );
        expect(repo.save).toHaveBeenCalled();
    });

    it('updates an existing department in place, never creating a duplicate', async () => {
        const existing = { erpId: 'dept-sales', name: 'Old name', parentErpId: null };
        repo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, {
            erpId: 'dept-sales',
            name: 'New name',
            parentErpId: 'dept-hq',
        });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New name', parentErpId: 'dept-hq' }),
        );
    });

    it('findAll returns rows ordered by name', async () => {
        await service.findAll(ctx);
        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });
});
