import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { BranchService } from '../../branch.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        find: vi.fn(async () => [] as unknown[]),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('BranchService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: BranchService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        service = new BranchService(connection as unknown as TransactionalConnection);
    });

    it('creates a new branch when no row matches the erpId', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, { erpId: 'branch-central', name: 'Central branch' });
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 'branch-central', name: 'Central branch' }),
        );
        expect(repo.save).toHaveBeenCalled();
    });

    it('updates an existing branch in place, never creating a duplicate', async () => {
        const existing = { erpId: 'branch-central', name: 'Old name' };
        repo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, { erpId: 'branch-central', name: 'New name' });
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New name' }));
    });

    it('findAll returns rows ordered by name', async () => {
        await service.findAll(ctx);
        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });

    it('createManual generates a prefixed erpId that can never collide with a real 1C GUID', async () => {
        const branch = await service.createManual(ctx, 'Warehouse district A');
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Warehouse district A',
                erpId: expect.stringMatching(/^mivend-manual:/),
            }),
        );
        expect(repo.save).toHaveBeenCalled();
        expect((branch as { name: string }).name).toBe('Warehouse district A');
    });

    it('createManual generates a different erpId on each call', async () => {
        const a = await service.createManual(ctx, 'Branch A');
        const b = await service.createManual(ctx, 'Branch B');
        expect((a as { erpId: string }).erpId).not.toBe((b as { erpId: string }).erpId);
    });
});
