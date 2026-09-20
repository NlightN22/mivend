import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AdministratorService,
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { AdministratorActivationService } from '../../administrator-activation.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        save: vi.fn(async (x: unknown) => x),
        update: vi.fn(),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('AdministratorActivationService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let administratorService: { softDelete: ReturnType<typeof vi.fn> };
    let listQueryBuilder: { build: ReturnType<typeof vi.fn> };
    let service: AdministratorActivationService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        administratorService = { softDelete: vi.fn() };
        listQueryBuilder = { build: vi.fn() };
        service = new AdministratorActivationService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
            listQueryBuilder as unknown as ListQueryBuilder,
        );
    });

    describe('syncFromErp', () => {
        it('is a no-op when no Administrator is linked to this erpId', async () => {
            repo.findOne.mockResolvedValue(null);

            await service.syncFromErp(ctx, 'user-unknown', false);

            expect(administratorService.softDelete).not.toHaveBeenCalled();
        });

        it('soft-deletes a linked, currently-active Administrator when 1C reports inactive', async () => {
            repo.findOne.mockResolvedValue({ id: 'admin-1', deletedAt: null });

            await service.syncFromErp(ctx, 'user-1', false);

            expect(administratorService.softDelete).toHaveBeenCalledWith(ctx, 'admin-1');
        });

        it('does not soft-delete twice when already deactivated', async () => {
            repo.findOne.mockResolvedValue({ id: 'admin-1', deletedAt: new Date() });

            await service.syncFromErp(ctx, 'user-1', false);

            expect(administratorService.softDelete).not.toHaveBeenCalled();
        });

        it('reactivates a soft-deleted Administrator when 1C reports active again', async () => {
            repo.findOne
                .mockResolvedValueOnce({ id: 'admin-1', deletedAt: new Date() }) // findByErpId
                .mockResolvedValueOnce({
                    id: 'admin-1',
                    deletedAt: new Date(),
                    user: { id: 'user-1' },
                }); // reactivate lookup

            await service.syncFromErp(ctx, 'user-1', true);

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'admin-1', deletedAt: null }),
            );
            expect(repo.update).toHaveBeenCalledWith({ id: 'user-1' }, { deletedAt: null });
        });

        it('does not reactivate an Administrator that is already active', async () => {
            repo.findOne.mockResolvedValue({ id: 'admin-1', deletedAt: null });

            await service.syncFromErp(ctx, 'user-1', true);

            expect(repo.save).not.toHaveBeenCalled();
        });
    });

    describe('setActive (manual override)', () => {
        it('throws when the Administrator does not exist', async () => {
            repo.findOne.mockResolvedValue(null);

            await expect(service.setActive(ctx, 'admin-missing', false)).rejects.toThrow();
        });

        it('soft-deletes an active Administrator when isActive=false', async () => {
            repo.findOne.mockResolvedValue({ id: 'admin-1', deletedAt: null });

            await service.setActive(ctx, 'admin-1', false);

            expect(administratorService.softDelete).toHaveBeenCalledWith(ctx, 'admin-1');
        });

        it('reactivates a deactivated Administrator when isActive=true', async () => {
            repo.findOne
                .mockResolvedValueOnce({ id: 'admin-1', deletedAt: new Date() })
                .mockResolvedValueOnce({
                    id: 'admin-1',
                    deletedAt: new Date(),
                    user: { id: 'user-1' },
                });

            await service.setActive(ctx, 'admin-1', true);

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'admin-1', deletedAt: null }),
            );
        });
    });

    describe('findDeactivated', () => {
        it('queries with soft-deleted rows included, filtered to deletedAt set and erpId set', async () => {
            const qb = {
                alias: 'administrator',
                withDeleted: vi.fn(),
                andWhere: vi.fn(),
                getManyAndCount: vi.fn(async () => [[{ id: 'admin-1' }], 1]),
            };
            qb.withDeleted.mockReturnValue(qb);
            qb.andWhere.mockReturnValue(qb);
            listQueryBuilder.build.mockReturnValue(qb);

            const result = await service.findDeactivated(ctx);

            expect(qb.withDeleted).toHaveBeenCalled();
            expect(qb.andWhere).toHaveBeenCalledWith('administrator.deletedAt IS NOT NULL');
            expect(qb.andWhere).toHaveBeenCalledWith('administrator.customFieldsErpid IS NOT NULL');
            expect(result).toEqual({ items: [{ id: 'admin-1' }], totalItems: 1 });
        });
    });
});
