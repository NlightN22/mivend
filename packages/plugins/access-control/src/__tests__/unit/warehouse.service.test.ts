import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { WarehouseService } from '../../warehouse.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
        find: vi.fn(async () => [] as unknown[]),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('WarehouseService', () => {
    let branchRepo: ReturnType<typeof createMockRepo>;
    let warehouseRepo: ReturnType<typeof createMockRepo>;
    let service: WarehouseService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        branchRepo = createMockRepo();
        warehouseRepo = createMockRepo();
        const connection = {
            getRepository: (_ctx: unknown, entity: { name: string }) =>
                entity.name === 'Branch' ? branchRepo : warehouseRepo,
        };
        service = new WarehouseService(connection as unknown as TransactionalConnection);
    });

    it('creates a new warehouse resolved against an existing branch', async () => {
        branchRepo.findOne.mockResolvedValue({ id: 'branch-1', erpId: 'erp-branch-1' });
        warehouseRepo.findOne.mockResolvedValue(null);
        const result = await service.upsert(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'erp-branch-1',
            isActive: true,
        });
        expect(warehouseRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 'wh-1', branchId: 'branch-1', isActive: true }),
        );
        expect(warehouseRepo.save).toHaveBeenCalled();
        expect(result).not.toBeNull();
    });

    it('updates an existing warehouse in place, never creating a duplicate', async () => {
        branchRepo.findOne.mockResolvedValue({ id: 'branch-1', erpId: 'erp-branch-1' });
        const existing = { erpId: 'wh-1', name: 'Old', branchId: 'branch-0', isActive: false };
        warehouseRepo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, {
            erpId: 'wh-1',
            name: 'New name',
            branchErpId: 'erp-branch-1',
            isActive: true,
        });
        expect(warehouseRepo.create).not.toHaveBeenCalled();
        expect(warehouseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New name', branchId: 'branch-1', isActive: true }),
        );
    });

    it('logs and skips (returns null, does not write) when the branch does not exist yet', async () => {
        branchRepo.findOne.mockResolvedValue(null);
        const result = await service.upsert(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'unknown-branch',
            isActive: true,
        });
        expect(result).toBeNull();
        expect(warehouseRepo.findOne).not.toHaveBeenCalled();
        expect(warehouseRepo.save).not.toHaveBeenCalled();
    });

    it('findByErpId queries by erpId', async () => {
        await service.findByErpId(ctx, 'wh-1');
        expect(warehouseRepo.findOne).toHaveBeenCalledWith({ where: { erpId: 'wh-1' } });
    });

    it('setBranchAssignment overrides branchId and includedInBranchAtp on the curated warehouse', async () => {
        const existing = {
            id: 'wh-1',
            erpId: 'erp-wh-1',
            branchId: 'branch-suggested',
            includedInBranchAtp: true,
        };
        warehouseRepo.findOne.mockResolvedValue(existing);
        const result = await service.setBranchAssignment(ctx, 'wh-1', 'branch-confirmed', false);
        expect(warehouseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ branchId: 'branch-confirmed', includedInBranchAtp: false }),
        );
        expect(result.branchId).toBe('branch-confirmed');
        expect(result.includedInBranchAtp).toBe(false);
    });

    it('setBranchAssignment throws when the warehouse does not exist', async () => {
        warehouseRepo.findOne.mockResolvedValue(null);
        await expect(service.setBranchAssignment(ctx, 'missing', 'branch-1', true)).rejects.toThrow(
            /not found/,
        );
        expect(warehouseRepo.save).not.toHaveBeenCalled();
    });
});
