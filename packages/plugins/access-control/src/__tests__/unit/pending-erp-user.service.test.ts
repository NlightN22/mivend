import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { PendingErpUserService } from '../../pending-erp-user.service';

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        findOne: vi.fn(),
        save: vi.fn(async (x: unknown) => x),
        create: vi.fn((x: unknown) => x),
        delete: vi.fn(),
        find: vi.fn(),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('PendingErpUserService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let service: PendingErpUserService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        const connection = { getRepository: () => repo };
        service = new PendingErpUserService(connection as unknown as TransactionalConnection);
    });

    describe('upsert', () => {
        it('creates a new row on first sight of an erpId', async () => {
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
    });

    describe('deleteByErpId', () => {
        it('deletes the row for a given erpId', async () => {
            await service.deleteByErpId(ctx, 'user-1');
            expect(repo.delete).toHaveBeenCalledWith({ erpId: 'user-1' });
        });
    });

    describe('findAll / findByErpId', () => {
        it('returns all rows ordered by firstSeenAt', async () => {
            repo.find.mockResolvedValue([{ erpId: 'user-1' }]);
            const result = await service.findAll(ctx);
            expect(repo.find).toHaveBeenCalledWith({ order: { firstSeenAt: 'ASC' } });
            expect(result).toEqual([{ erpId: 'user-1' }]);
        });

        it('returns null when no pending row matches erpId', async () => {
            repo.findOne.mockResolvedValue(null);
            const result = await service.findByErpId(ctx, 'user-unknown');
            expect(result).toBeNull();
        });
    });
});
