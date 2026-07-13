import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { BranchService } from '../../branch.service';

function createMockRepo() {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        find: vi.fn(async () => [] as unknown[]),
    };
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
});
