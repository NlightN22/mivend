import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { SavedViewsService } from '../../saved-views.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        find: vi.fn(async () => [] as unknown[]),
        save: vi.fn(async (x: unknown) => x),
        delete: vi.fn(async () => ({ affected: 1 })),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('SavedViewsService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: SavedViewsService;
    let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        administratorService = { findOneByUserId: vi.fn(async () => ({ id: 'admin-1' })) };
        service = new SavedViewsService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
        );
    });

    it('finds views scoped to the current administrator and pageKey', async () => {
        await service.findForCurrentAdministrator(ctx, 'orders');
        expect(repo.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: { administratorId: 'admin-1', pageKey: 'orders' } }),
        );
    });

    it('saves a new view tagged with the current administrator', async () => {
        const result = await service.save(ctx, {
            pageKey: 'orders',
            name: 'My view',
            filters: '{"state":"PaymentAuthorized"}',
            visibleColumns: ['code', 'customer'],
        });
        expect(repo.save).toHaveBeenCalled();
        expect((result as { administratorId: string }).administratorId).toBe('admin-1');
    });

    it('deletes only scoped to the owning administrator, returns false when nothing matched', async () => {
        repo.delete.mockResolvedValueOnce({ affected: 0 });
        const deleted = await service.delete(ctx, '42');
        expect(repo.delete).toHaveBeenCalledWith(
            expect.objectContaining({ administratorId: 'admin-1' }),
        );
        expect(deleted).toBe(false);
    });

    it('throws when there is no active administrator', async () => {
        administratorService.findOneByUserId.mockResolvedValueOnce(null);
        await expect(
            service.save({} as RequestContext, {
                pageKey: 'orders',
                name: 'x',
                filters: '{}',
                visibleColumns: [],
            }),
        ).rejects.toThrow();
    });
});
