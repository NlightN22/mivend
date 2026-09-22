import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { WarehouseStreamHandler } from '../../handlers/warehouse.handler';

function createConnection(existingLocation: { id: string } | undefined): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    return {
        rawConnection: {
            createQueryBuilder: () => ({
                select: () => ({
                    from: () => ({
                        where: () => ({
                            getRawOne: vi.fn().mockResolvedValue(existingLocation),
                        }),
                    }),
                }),
            }),
        },
    };
}

describe('WarehouseStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips (no upsert, no update) when name is missing and no existing warehouse matches', async () => {
        const warehouseService = {
            upsert: vi.fn(),
            setActiveStateIfExists: vi.fn().mockResolvedValue(false),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { departmentId: 'branch-guid' });

        expect(warehouseService.upsert).not.toHaveBeenCalled();
        expect(warehouseService.setActiveStateIfExists).toHaveBeenCalledWith(ctx, 'wh-1', false);
    });

    // A deletion tombstone never carries a name (confirmed against real staging-integration
    // payloads, mivend.issue.84.88 follow-up) — must still deactivate an already-known warehouse
    // instead of silently skipping the event entirely (the previous behavior).
    it('updates isActive only, via setActiveStateIfExists, when name is missing but the warehouse already exists', async () => {
        const warehouseService = {
            upsert: vi.fn(),
            setActiveStateIfExists: vi.fn().mockResolvedValue(true),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { isDeleted: true });

        expect(warehouseService.setActiveStateIfExists).toHaveBeenCalledWith(ctx, 'wh-1', false);
        expect(warehouseService.upsert).not.toHaveBeenCalled();
        expect(stockLocationService.create).not.toHaveBeenCalled();
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — proto3 JSON
    // encoding omits a scalar field equal to its zero-value, so `isActive:false` is NEVER sent
    // explicitly, only as an absent key (confirmed live with Search Platform, mivend#89's
    // follow-up). Absent must read as false, not true — this test previously asserted the
    // opposite (the actual bug).
    it('creates a new StockLocation when the warehouse upserts and no location exists yet', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', {
            name: 'Main warehouse',
            departmentId: 'branch-guid',
            isActive: true,
        });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'branch-guid',
            isActive: true,
        });
        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Main warehouse',
            customFields: { warehouseErpId: 'wh-1' },
        });
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });

    it('updates the existing StockLocation by warehouseErpId instead of creating a duplicate', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection({ id: 'loc-1' }) as never,
        );

        await handler.apply(ctx, 'wh-1', {
            name: 'Renamed warehouse',
            departmentId: 'branch-guid',
        });

        expect(stockLocationService.update).toHaveBeenCalledWith(ctx, {
            id: 'loc-1',
            name: 'Renamed warehouse',
        });
        expect(stockLocationService.create).not.toHaveBeenCalled();
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — proto3 JSON
    // encoding omits a scalar field equal to its zero-value, so `isActive:false` is NEVER sent
    // explicitly, only as an absent key (confirmed live with Search Platform, mivend#89's
    // follow-up — a real incident: a business-db deactivation backfill's replayed events had no
    // isActive key at all, and the old `!== false` check silently kept treating them as active).
    it('treats isActive absent from the payload as inactive (proto3 omits the false zero-value)', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse', departmentId: 'branch-guid' });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'branch-guid',
            isActive: false,
        });
    });

    it('still creates the StockLocation when the branch cannot be resolved (warehouse comes back unassigned, not null)', async () => {
        const warehouseService = {
            upsert: vi.fn().mockResolvedValue({ id: 'w1', branchId: null }),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', {
            name: 'Main warehouse',
            departmentId: 'unknown-branch',
        });

        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Main warehouse',
            customFields: { warehouseErpId: 'wh-1' },
        });
    });

    // Issue #94: the ERP's warehouse hierarchy includes folder/group nodes, not just real leaf
    // warehouses — a folder must never become a Warehouse or StockLocation row.
    it('skips folder rows entirely (isFolder === true), even when a matching StockLocation already exists', async () => {
        const warehouseService = { upsert: vi.fn() };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection({ id: 'loc-1' }) as never,
        );

        await handler.apply(ctx, 'wh-folder-1', {
            name: 'Group folder',
            departmentId: 'branch-guid',
            isActive: true,
            isFolder: true,
        });

        expect(warehouseService.upsert).not.toHaveBeenCalled();
        expect(stockLocationService.create).not.toHaveBeenCalled();
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });

    it('still creates the StockLocation for a non-folder row (isFolder explicitly false)', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', {
            name: 'Main warehouse',
            departmentId: 'branch-guid',
            isActive: true,
            isFolder: false,
        });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'branch-guid',
            isActive: true,
        });
        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Main warehouse',
            customFields: { warehouseErpId: 'wh-1' },
        });
    });

    it('still creates the StockLocation when departmentId is entirely absent from the payload', async () => {
        const warehouseService = {
            upsert: vi.fn().mockResolvedValue({ id: 'w1', branchId: null }),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse', isActive: true });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: '',
            isActive: true,
        });
        expect(stockLocationService.create).toHaveBeenCalled();
    });
});
