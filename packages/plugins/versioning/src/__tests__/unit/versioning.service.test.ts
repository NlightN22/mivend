import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import { VersioningService } from '../../versioning.service';

const mockRepo = {
    create: vi.fn((input: unknown) => input),
    save: vi.fn(async (row: unknown) => row),
    find: vi.fn(async () => []),
};

function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    qb.where = vi.fn(() => qb);
    qb.andWhere = vi.fn(() => qb);
    qb.orderBy = vi.fn(() => qb);
    qb.take = vi.fn(() => qb);
    qb.skip = vi.fn(() => qb);
    qb.getMany = vi.fn(async () => []);
    qb.getCount = vi.fn(async () => 0);
    return qb;
}

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
};

const mockAdministratorService = {
    findOneByUserId: vi.fn(async () => ({ id: 'admin-1' })),
} as unknown as AdministratorService;

const mockCtx = { activeUserId: 'user-1' } as unknown as RequestContext;

describe('VersioningService', () => {
    let service: VersioningService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.create.mockImplementation((input: unknown) => input);
        mockRepo.save.mockImplementation(async (row: unknown) => row);
        mockConnection.getRepository.mockReturnValue(mockRepo);
        (mockAdministratorService.findOneByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'admin-1',
        });
        service = new VersioningService(
            mockConnection as unknown as TransactionalConnection,
            mockAdministratorService,
        );
    });

    describe('recordChange', () => {
        it('serializes changedFields to JSON and resolves the caller administratorId', async () => {
            const row = await service.recordChange(mockCtx, {
                entityName: 'TradingPoint',
                entityId: 'tp-1',
                action: 'update',
                changedFields: { address: { from: 'A', to: 'B' } },
            });

            expect(mockAdministratorService.findOneByUserId).toHaveBeenCalledWith(
                mockCtx,
                'user-1',
            );
            expect(row).toEqual(
                expect.objectContaining({
                    entityName: 'TradingPoint',
                    entityId: 'tp-1',
                    action: 'update',
                    administratorId: 'admin-1',
                    changedFields: JSON.stringify({ address: { from: 'A', to: 'B' } }),
                }),
            );
        });

        it('stores null changedFields when no diff is given (e.g. a bare reactivate)', async () => {
            const row = await service.recordChange(mockCtx, {
                entityName: 'TradingPoint',
                entityId: 'tp-1',
                action: 'reactivate',
            });

            expect(row).toEqual(expect.objectContaining({ changedFields: null }));
        });

        it('stores a null administratorId for system-initiated changes (no active user)', async () => {
            const row = await service.recordChange(
                { activeUserId: undefined } as unknown as RequestContext,
                {
                    entityName: 'TradingPoint',
                    entityId: 'tp-1',
                    action: 'update',
                },
            );

            expect(mockAdministratorService.findOneByUserId).not.toHaveBeenCalled();
            expect(row).toEqual(expect.objectContaining({ administratorId: null }));
        });
    });

    describe('findForEntities', () => {
        it('returns an empty page without querying when given no refs', async () => {
            const result = await service.findForEntities(mockCtx, []);
            expect(result).toEqual({ items: [], totalItems: 0 });
            expect(mockConnection.getRepository).not.toHaveBeenCalled();
        });

        it('groups refs by entityName into one IN-clause per entity type', async () => {
            const qb = mockQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findForEntities(mockCtx, [
                { entityName: 'TradingPoint', entityId: 'tp-1' },
                { entityName: 'TradingPoint', entityId: 'tp-2' },
                { entityName: 'Counterparty', entityId: 'cp-1' },
            ]);

            expect(qb.where).toHaveBeenCalledWith(
                '(v.entityName = :name0 AND v.entityId IN (:...ids0)) OR (v.entityName = :name1 AND v.entityId IN (:...ids1))',
                {
                    name0: 'TradingPoint',
                    ids0: ['tp-1', 'tp-2'],
                    name1: 'Counterparty',
                    ids1: ['cp-1'],
                },
            );
            expect(qb.orderBy).toHaveBeenCalledWith('v.createdAt', 'DESC');
        });

        it('bounds the query at 50 by default', async () => {
            const qb = mockQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findForEntities(mockCtx, [
                { entityName: 'Counterparty', entityId: 'cp-1' },
            ]);

            expect(qb.take).toHaveBeenCalledWith(50);
        });

        it('respects an explicit take/skip override', async () => {
            const qb = mockQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findForEntities(
                mockCtx,
                [{ entityName: 'Counterparty', entityId: 'cp-1' }],
                { take: 25, skip: 10 },
            );

            expect(qb.take).toHaveBeenCalledWith(25);
            expect(qb.skip).toHaveBeenCalledWith(10);
        });

        it('pushes action/entityName/administratorId/createdAfter filters into SQL', async () => {
            const qb = mockQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findForEntities(
                mockCtx,
                [{ entityName: 'Counterparty', entityId: 'cp-1' }],
                {
                    action: 'update',
                    entityName: 'TradingPoint',
                    administratorId: 'admin-2',
                    createdAfter: '2026-01-01T00:00:00.000Z',
                },
            );

            expect(qb.andWhere).toHaveBeenCalledWith('v.entityName = :entityNameFilter', {
                entityNameFilter: 'TradingPoint',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('v.action = :actionFilter', {
                actionFilter: 'update',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('v.administratorId = :adminFilter', {
                adminFilter: 'admin-2',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('v.createdAt >= :createdAfter', {
                createdAfter: '2026-01-01T00:00:00.000Z',
            });
        });

        it('filters to system-initiated changes only when system:true', async () => {
            const qb = mockQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findForEntities(
                mockCtx,
                [{ entityName: 'Counterparty', entityId: 'cp-1' }],
                {
                    system: true,
                },
            );

            expect(qb.andWhere).toHaveBeenCalledWith('v.administratorId IS NULL');
        });
    });

    describe('findForEntity', () => {
        it('bounds the query at 300 by default (issue #39 — was previously unbounded)', async () => {
            await service.findForEntity(mockCtx, 'Counterparty', 'cp-1');

            expect(mockRepo.find).toHaveBeenCalledWith({
                where: { entityName: 'Counterparty', entityId: 'cp-1' },
                order: { createdAt: 'DESC' },
                take: 300,
            });
        });

        it('respects an explicit take override', async () => {
            await service.findForEntity(mockCtx, 'Counterparty', 'cp-1', 25);

            expect(mockRepo.find).toHaveBeenCalledWith({
                where: { entityName: 'Counterparty', entityId: 'cp-1' },
                order: { createdAt: 'DESC' },
                take: 25,
            });
        });
    });
});
