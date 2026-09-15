import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DepartmentStreamHandler } from '../../handlers/department.handler';

describe('DepartmentStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips (no upsert, no update) when name is missing and no existing department matches', async () => {
        const departmentService = {
            upsert: vi.fn(),
            setActiveStateIfExists: vi.fn().mockResolvedValue(false),
        };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', {});

        expect(departmentService.upsert).not.toHaveBeenCalled();
        expect(departmentService.setActiveStateIfExists).toHaveBeenCalledWith(ctx, 'dept-1', false);
    });

    // A deletion tombstone never carries a name (confirmed against real staging-integration
    // payloads for organization/warehouse/category, mivend.issue.88 follow-up) — must still
    // deactivate an already-known department instead of silently skipping the event.
    it('updates isActive only, via setActiveStateIfExists, when name is missing but the department already exists', async () => {
        const departmentService = {
            upsert: vi.fn(),
            setActiveStateIfExists: vi.fn().mockResolvedValue(true),
        };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { isDeleted: true });

        expect(departmentService.setActiveStateIfExists).toHaveBeenCalledWith(ctx, 'dept-1', false);
        expect(departmentService.upsert).not.toHaveBeenCalled();
    });

    it('upserts by erpId, mapping parentId to parentErpId, with isActive computed from the payload', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', {
            name: 'Sales',
            parentId: 'dept-root',
            isActive: true,
        });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: 'dept-root',
            isActive: true,
        });
    });

    it('passes null parentErpId when parentId is absent (root department)', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales', isActive: true });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: null,
            isActive: true,
        });
    });

    // Integration Service encodes isActive as a plain (non-optional) proto3 bool — an absent key
    // means false, not true (same rule as every other handler, mivend#89's precedent).
    it('treats isActive absent from the payload as inactive', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales' });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: null,
            isActive: false,
        });
    });

    it('treats isDeleted:true as inactive even when isActive is true', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales', isActive: true, isDeleted: true });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: null,
            isActive: false,
        });
    });

    it('re-upserting the same erpId updates rather than duplicating', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales', isActive: true });
        await handler.apply(ctx, 'dept-1', { name: 'Sales (renamed)', isActive: true });

        expect(departmentService.upsert).toHaveBeenCalledTimes(2);
        expect(departmentService.upsert).toHaveBeenNthCalledWith(2, ctx, {
            erpId: 'dept-1',
            name: 'Sales (renamed)',
            parentErpId: null,
            isActive: true,
        });
    });
});
