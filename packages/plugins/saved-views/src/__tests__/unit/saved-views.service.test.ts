import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { SavedViewsService } from '../../saved-views.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        find: vi.fn(async () => [] as unknown[]),
        findOne: vi.fn(async () => null as unknown),
        save: vi.fn(async (x: unknown) => x),
        update: vi.fn(async () => ({ affected: 1 })),
        delete: vi.fn(async () => ({ affected: 1 })),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

function ctxWith(canManageShared: boolean): RequestContext {
    return {
        activeUserId: 'user-1',
        userHasPermissions: () => canManageShared,
    } as unknown as RequestContext;
}

const input = { pageKey: 'orders', name: 'My view', filters: '{}', visibleColumns: ['code'] };

describe('SavedViewsService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: SavedViewsService;
    let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
    const plain = ctxWith(false);
    const manager = ctxWith(true);

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        administratorService = { findOneByUserId: vi.fn(async () => ({ id: 'admin-1' })) };
        service = new SavedViewsService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
        );
    });

    it('lists the own personal views plus every shared view of the list', async () => {
        await service.findForCurrentAdministrator(plain, 'orders');
        expect(repo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: [
                    { administratorId: 'admin-1', pageKey: 'orders', scope: 'PERSONAL' },
                    { pageKey: 'orders', scope: 'SHARED' },
                ],
            }),
        );
    });

    it('saves a personal view tagged with the current administrator, never as default', async () => {
        const result = (await service.save(plain, input)) as unknown as Record<string, unknown>;
        expect(result).toMatchObject({
            administratorId: 'admin-1',
            scope: 'PERSONAL',
            isDefault: false,
        });
    });

    it('refuses to save a shared view without the manage permission', async () => {
        await expect(service.save(plain, { ...input, scope: 'SHARED' })).rejects.toThrow();
        expect(repo.save).not.toHaveBeenCalled();
        await service.save(manager, { ...input, scope: 'SHARED' });
        expect(repo.save).toHaveBeenCalled();
    });

    it('does not touch a personal view of another administrator', async () => {
        repo.findOne.mockResolvedValue({ id: 5, scope: 'PERSONAL', administratorId: 'admin-2' });
        expect(await service.update(plain, { id: '5', name: 'x' })).toBeNull();
        expect(await service.delete(plain, '5')).toBe(false);
        expect(repo.update).not.toHaveBeenCalled();
        expect(repo.delete).not.toHaveBeenCalled();
    });

    it('updates an own personal view with one UPDATE scoped to its owner', async () => {
        repo.findOne.mockResolvedValue({ id: 5, scope: 'PERSONAL', administratorId: 'admin-1' });
        await service.update(plain, { id: '5', name: 'Renamed', filters: '{"a":1}' });
        expect(repo.update).toHaveBeenCalledTimes(1);
        expect(repo.update).toHaveBeenCalledWith(
            { id: '5', scope: 'PERSONAL', administratorId: 'admin-1' },
            { name: 'Renamed', filters: '{"a":1}' },
        );
    });

    it('requires the permission to edit, delete or set the default of a shared view', async () => {
        repo.findOne.mockResolvedValue({ id: 7, scope: 'SHARED', administratorId: 'admin-2' });
        await expect(service.update(plain, { id: '7', name: 'x' })).rejects.toThrow();
        await expect(service.delete(plain, '7')).rejects.toThrow();
        await expect(service.setDefault(plain, '7', true)).rejects.toThrow();
        expect(await service.delete(manager, '7')).toBe(true);
    });

    it('throws when there is no active administrator', async () => {
        administratorService.findOneByUserId.mockResolvedValueOnce(null);
        await expect(service.save({} as RequestContext, input)).rejects.toThrow(
            /No active administrator/,
        );
    });
});
