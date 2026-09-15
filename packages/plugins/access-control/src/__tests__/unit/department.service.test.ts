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
            expect.objectContaining({
                erpId: 'dept-sales',
                name: 'Sales',
                parentErpId: null,
                isActive: true,
            }),
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
            isActive: false,
        });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New name', parentErpId: 'dept-hq', isActive: false }),
        );
    });

    // mivend.issue.88 follow-up: erp-import's own DepartmentRecordDto never carried isActive —
    // omitting it must default to active, never leave the column undefined.
    it('defaults isActive to true when omitted from the input (erp-import path)', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, { erpId: 'dept-sales', name: 'Sales' });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });

    describe('setActiveStateIfExists', () => {
        it('updates isActive on an existing department and returns true', async () => {
            const existing = { erpId: 'dept-sales', name: 'Sales', isActive: true };
            repo.findOne.mockResolvedValue(existing);
            const result = await service.setActiveStateIfExists(ctx, 'dept-sales', false);
            expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
            expect(result).toBe(true);
        });

        it('does nothing and returns false when no department matches erpId', async () => {
            repo.findOne.mockResolvedValue(null);
            const result = await service.setActiveStateIfExists(ctx, 'dept-unknown', false);
            expect(repo.save).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });
    });

    it('findAll returns rows ordered by name', async () => {
        await service.findAll(ctx);
        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });
});
