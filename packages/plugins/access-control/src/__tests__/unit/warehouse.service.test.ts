import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { WarehouseService } from '../../warehouse.service';

function createRawQueryBuilderMock(): {
    getRawMany: ReturnType<typeof vi.fn<[], Promise<unknown[]>>>;
} {
    return { getRawMany: vi.fn(async () => [] as unknown[]) };
}

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
    let stockLocationRepo: ReturnType<typeof createMockRepo>;
    let rawQueryBuilder: ReturnType<typeof createRawQueryBuilderMock>;
    let service: WarehouseService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        branchRepo = createMockRepo();
        warehouseRepo = createMockRepo();
        stockLocationRepo = createMockRepo();
        rawQueryBuilder = createRawQueryBuilderMock();
        const connection = {
            getRepository: (_ctx: unknown, entity: { name: string }) => {
                if (entity.name === 'Branch') return branchRepo;
                if (entity.name === 'StockLocation') return stockLocationRepo;
                return warehouseRepo;
            },
            rawConnection: {
                createQueryBuilder: () => ({
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    getRawMany: rawQueryBuilder.getRawMany,
                }),
            },
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

    it('creates the warehouse unassigned (branchId null) when the branch does not exist yet, never skipping the row', async () => {
        branchRepo.findOne.mockResolvedValue(null);
        warehouseRepo.findOne.mockResolvedValue(null);
        const result = await service.upsert(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'unknown-branch',
            isActive: true,
        });
        expect(warehouseRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 'wh-1', branchId: null, isActive: true }),
        );
        expect(warehouseRepo.save).toHaveBeenCalled();
        expect(result).not.toBeNull();
    });

    it('never clobbers a manually-assigned branchId just because a later ERP event still cannot resolve one', async () => {
        branchRepo.findOne.mockResolvedValue(null);
        const existing = { erpId: 'wh-1', name: 'Old', branchId: 'branch-manual', isActive: true };
        warehouseRepo.findOne.mockResolvedValue(existing);
        await service.upsert(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'unknown-branch',
            isActive: true,
        });
        expect(warehouseRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ branchId: 'branch-manual' }),
        );
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

    describe('findActiveStockLocationsForBranch', () => {
        // mivend#85 audit finding: ReservationService.reserveOrder() takes a FOR UPDATE lock on
        // every candidate location returned here, per order line — an unordered result risks two
        // concurrent transactions locking the same two locations in opposite order (Postgres
        // deadlock 40P01). Must always query in a stable order.
        it('queries StockLocation ordered by id, not in whatever order Postgres happens to return', async () => {
            warehouseRepo.find.mockResolvedValue([
                { erpId: 'wh-a', branchId: 'branch-1', isActive: true },
                { erpId: 'wh-b', branchId: 'branch-1', isActive: true },
            ]);
            rawQueryBuilder.getRawMany.mockResolvedValue([{ id: 'loc-a' }, { id: 'loc-b' }]);
            stockLocationRepo.find.mockResolvedValue([{ id: 'loc-a' }, { id: 'loc-b' }]);

            await service.findActiveStockLocationsForBranch(ctx, 'branch-1');

            expect(stockLocationRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ order: { id: 'ASC' } }),
            );
        });

        it('returns an empty array when the branch has no active warehouses', async () => {
            warehouseRepo.find.mockResolvedValue([
                { erpId: 'wh-a', branchId: 'other-branch', isActive: true },
            ]);

            const result = await service.findActiveStockLocationsForBranch(ctx, 'branch-1');

            expect(result).toEqual([]);
            expect(rawQueryBuilder.getRawMany).not.toHaveBeenCalled();
        });

        it('returns an empty array when no StockLocation matches the branch warehouses', async () => {
            warehouseRepo.find.mockResolvedValue([
                { erpId: 'wh-a', branchId: 'branch-1', isActive: true },
            ]);
            rawQueryBuilder.getRawMany.mockResolvedValue([]);

            const result = await service.findActiveStockLocationsForBranch(ctx, 'branch-1');

            expect(result).toEqual([]);
            expect(stockLocationRepo.find).not.toHaveBeenCalled();
        });
    });
});
