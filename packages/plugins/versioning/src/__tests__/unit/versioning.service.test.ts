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
    qb.orderBy = vi.fn(() => qb);
    qb.getMany = vi.fn(async () => []);
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
        it('returns an empty array without querying when given no refs', async () => {
            const result = await service.findForEntities(mockCtx, []);
            expect(result).toEqual([]);
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
    });
});
