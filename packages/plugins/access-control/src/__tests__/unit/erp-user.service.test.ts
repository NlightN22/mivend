import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ListQueryBuilder, RequestContext, TransactionalConnection } from '@vendure/core';

import { ErpUserService } from '../../erp-user.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        save: vi.fn(async (x: unknown) => x),
        create: vi.fn((x: unknown) => x),
        delete: vi.fn(),
        find: vi.fn(),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

function mockQb(rows: unknown[], total: number) {
    const qb = {
        alias: 'erpuser',
        andWhere: vi.fn(),
        getManyAndCount: vi.fn(async () => [rows, total]),
    };
    qb.andWhere.mockReturnValue(qb);
    return qb;
}

describe('ErpUserService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let listQueryBuilder: { build: ReturnType<typeof vi.fn> };
    let service: ErpUserService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        listQueryBuilder = { build: vi.fn() };
        service = new ErpUserService(
            connection as unknown as TransactionalConnection,
            listQueryBuilder as unknown as ListQueryBuilder,
        );
    });

    describe('upsert', () => {
        it('creates a new unlinked row on first sight of an erpId', async () => {
            repo.findOne.mockResolvedValue(null);

            await service.upsert(ctx, {
                erpId: 'user-1',
                fullName: 'Ivan Petrov',
                email: 'ivan@example.com',
                departmentId: 'dept-1',
            });

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'user-1',
                    fullName: 'Ivan Petrov',
                    email: 'ivan@example.com',
                    departmentId: 'dept-1',
                    status: 'unlinked',
                    administratorId: null,
                }),
            );
            expect(repo.save).toHaveBeenCalled();
        });

        it('updates fields and lastSeenAt on a repeat event for the same erpId', async () => {
            const existing = {
                erpId: 'user-1',
                fullName: 'Old Name',
                email: 'old@example.com',
                departmentId: 'dept-1',
                status: 'unlinked',
                administratorId: null,
                firstSeenAt: new Date('2026-01-01'),
                lastSeenAt: new Date('2026-01-01'),
            };
            repo.findOne.mockResolvedValue(existing);

            await service.upsert(ctx, { erpId: 'user-1', fullName: 'New Name' });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ fullName: 'New Name', email: 'old@example.com' }),
            );
            expect(repo.create).not.toHaveBeenCalled();
        });

        it('leaves a field untouched when the input omits it (undefined vs explicit null)', async () => {
            const existing = {
                erpId: 'user-1',
                fullName: 'Ivan',
                email: 'ivan@example.com',
                departmentId: 'dept-1',
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
            };
            repo.findOne.mockResolvedValue(existing);

            await service.upsert(ctx, { erpId: 'user-1', email: null });

            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ email: null, fullName: 'Ivan', departmentId: 'dept-1' }),
            );
        });

        it('applies an explicit active=false signal (1C reported inactive/deleted)', async () => {
            repo.findOne.mockResolvedValue(null);

            await service.upsert(ctx, { erpId: 'user-1', active: false });

            expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
        });

        it('leaves an existing active flag untouched when the event omits it', async () => {
            const existing = {
                erpId: 'user-1',
                active: true,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
            };
            repo.findOne.mockResolvedValue(existing);

            await service.upsert(ctx, { erpId: 'user-1', fullName: 'New Name' });

            expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
        });
    });

    describe('markLinked', () => {
        it('flips an existing row to linked with the given administratorId, never deletes it', async () => {
            const existing = {
                erpId: 'user-1',
                status: 'unlinked',
                administratorId: null,
                firstSeenAt: new Date('2026-01-01'),
                lastSeenAt: new Date('2026-01-01'),
            };
            repo.findOne.mockResolvedValue(existing);

            await service.markLinked(ctx, 'user-1', 'admin-1');

            expect(repo.delete).not.toHaveBeenCalled();
            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'linked', administratorId: 'admin-1' }),
            );
        });

        it('creates a linked row when none existed yet (immediate email-match path)', async () => {
            repo.findOne.mockResolvedValue(null);

            await service.markLinked(ctx, 'user-2', 'admin-2');

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'user-2',
                    status: 'linked',
                    administratorId: 'admin-2',
                }),
            );
            expect(repo.save).toHaveBeenCalled();
        });
    });

    describe('findAllPaginated / findByErpId', () => {
        it('filters to unlinked, non-inactive rows, sorted by firstSeenAt', async () => {
            const qb = mockQb([{ erpId: 'user-1' }], 1);
            listQueryBuilder.build.mockReturnValue(qb);

            const result = await service.findAllPaginated(ctx);

            expect(listQueryBuilder.build).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                expect.objectContaining({ ctx, orderBy: { firstSeenAt: 'ASC' } }),
            );
            expect(qb.andWhere).toHaveBeenCalledWith('erpuser.status = :status', {
                status: 'unlinked',
            });
            expect(qb.andWhere).toHaveBeenCalledWith(
                '(erpuser.active IS NULL OR erpuser.active = true)',
            );
            expect(result).toEqual({ items: [{ erpId: 'user-1' }], totalItems: 1 });
        });

        it('returns null when no row matches erpId', async () => {
            repo.findOne.mockResolvedValue(null);
            const result = await service.findByErpId(ctx, 'user-unknown');
            expect(result).toBeNull();
        });
    });
});
