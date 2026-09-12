import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DepartmentStreamHandler } from '../../handlers/department.handler';

describe('DepartmentStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name is missing', async () => {
        const departmentService = { upsert: vi.fn() };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', {});

        expect(departmentService.upsert).not.toHaveBeenCalled();
    });

    it('upserts by erpId, mapping parentId to parentErpId', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales', parentId: 'dept-root' });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: 'dept-root',
        });
    });

    it('passes null parentErpId when parentId is absent (root department)', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales' });

        expect(departmentService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'dept-1',
            name: 'Sales',
            parentErpId: null,
        });
    });

    it('re-upserting the same erpId updates rather than duplicating', async () => {
        const departmentService = { upsert: vi.fn().mockResolvedValue({}) };
        const handler = new DepartmentStreamHandler(departmentService as never);

        await handler.apply(ctx, 'dept-1', { name: 'Sales' });
        await handler.apply(ctx, 'dept-1', { name: 'Sales (renamed)' });

        expect(departmentService.upsert).toHaveBeenCalledTimes(2);
        expect(departmentService.upsert).toHaveBeenNthCalledWith(2, ctx, {
            erpId: 'dept-1',
            name: 'Sales (renamed)',
            parentErpId: null,
        });
    });
});
