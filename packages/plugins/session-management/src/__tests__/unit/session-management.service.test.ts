import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    ConfigService,
    RequestContext,
    TransactionalConnection,
    UserService,
} from '@vendure/core';

import { SessionManagementService } from '../../session-management.service';

interface FakeSession {
    id: string;
    token: string;
    invalidated: boolean;
    createdAt: Date;
    expires: Date;
    customFields: { userAgent?: string | null; actingAdministratorId?: string | null };
}

function makeSession(overrides: Partial<FakeSession>): FakeSession {
    return {
        id: 'session-1',
        token: 'token-1',
        invalidated: false,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        expires: new Date('2027-07-01T00:00:00Z'),
        customFields: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0' },
        ...overrides,
    };
}

describe('SessionManagementService', () => {
    let repo: {
        find: ReturnType<typeof vi.fn>;
        findOne: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
    };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let deleteFromCache: ReturnType<typeof vi.fn>;
    let configService: ConfigService;
    let userService: { getUserById: ReturnType<typeof vi.fn> };
    let queryBuilder: {
        delete: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
        execute: ReturnType<typeof vi.fn>;
    };
    let service: SessionManagementService;

    function ctxFor(userId: string | undefined, currentToken?: string): RequestContext {
        return {
            activeUserId: userId,
            session: currentToken ? { token: currentToken } : undefined,
        } as unknown as RequestContext;
    }

    beforeEach(() => {
        repo = { find: vi.fn(), findOne: vi.fn(), update: vi.fn(), remove: vi.fn() };
        connection = { getRepository: vi.fn(() => repo) };
        deleteFromCache = vi.fn();
        configService = {
            authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
        } as unknown as ConfigService;
        userService = { getUserById: vi.fn() };

        queryBuilder = {
            delete: vi.fn(),
            from: vi.fn(),
            where: vi.fn(),
            execute: vi.fn(),
        };
        queryBuilder.delete.mockReturnValue(queryBuilder);
        queryBuilder.from.mockReturnValue(queryBuilder);
        queryBuilder.where.mockReturnValue(queryBuilder);
        connection.getRepository.mockImplementation((_ctx: unknown, entity: { name?: string }) =>
            entity.name === 'Session' ? { createQueryBuilder: vi.fn(() => queryBuilder) } : repo,
        );

        service = new SessionManagementService(
            connection as unknown as TransactionalConnection,
            configService,
            userService as unknown as UserService,
        );
    });

    it('lists only the sessions belonging to the calling user, marking the current one', async () => {
        const other = makeSession({
            id: 'session-2',
            token: 'token-2',
            customFields: { userAgent: null },
        });
        const mine = makeSession({ id: 'session-1', token: 'token-1' });
        repo.find.mockResolvedValue([mine, other]);

        const result = await service.getMySessions(ctxFor('user-1', 'token-1'));

        expect(connection.getRepository).toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result.find(s => s.id === 'session-1')?.current).toBe(true);
        expect(result.find(s => s.id === 'session-2')?.current).toBe(false);
        expect(result.find(s => s.id === 'session-2')?.deviceLabel).toBe('Unknown device');
    });

    it('keeps a manager acting session out of the customer list, single end and bulk end', async () => {
        const acting = makeSession({
            id: 'session-9',
            token: 'token-9',
            customFields: { actingAdministratorId: '7' },
        });
        const mine = makeSession({ id: 'session-1', token: 'token-1' });
        repo.find.mockResolvedValue([mine, acting]);
        repo.findOne.mockResolvedValue(acting);

        const listed = await service.getMySessions(ctxFor('user-1'));
        const endedOne = await service.endSession(ctxFor('user-1'), 'session-9');
        await service.endOtherSessions(ctxFor('user-1', 'other'));

        expect(listed.map(s => s.id)).toEqual(['session-1']);
        expect(endedOne).toBe(false);
        expect(deleteFromCache).toHaveBeenCalledTimes(1);
        expect(deleteFromCache).toHaveBeenCalledWith('token-1');
    });

    it('returns an empty list when there is no active user', async () => {
        const result = await service.getMySessions(ctxFor(undefined));
        expect(result).toEqual([]);
        expect(connection.getRepository).not.toHaveBeenCalled();
    });

    it('ends a session that belongs to the caller and evicts it from the cache', async () => {
        const session = makeSession({});
        repo.findOne.mockResolvedValue(session);

        const ok = await service.endSession(ctxFor('user-1'), 'session-1');

        expect(ok).toBe(true);
        expect(repo.update).toHaveBeenCalledWith({ id: 'session-1' }, { invalidated: true });
        expect(deleteFromCache).toHaveBeenCalledWith('token-1');
    });

    it('does not end a session scoped to a different user (query returns nothing)', async () => {
        repo.findOne.mockResolvedValue(undefined);

        const ok = await service.endSession(ctxFor('user-1'), 'someone-elses-session');

        expect(ok).toBe(false);
        expect(repo.update).not.toHaveBeenCalled();
        expect(deleteFromCache).not.toHaveBeenCalled();
    });

    it('ends every session except the current one', async () => {
        const current = makeSession({ id: 'session-1', token: 'current-token' });
        const other1 = makeSession({ id: 'session-2', token: 'other-token-1' });
        const other2 = makeSession({ id: 'session-3', token: 'other-token-2' });
        repo.find.mockResolvedValue([current, other1, other2]);

        const ok = await service.endOtherSessions(ctxFor('user-1', 'current-token'));

        expect(ok).toBe(true);
        expect(repo.update).toHaveBeenCalledTimes(2);
        expect(repo.update).not.toHaveBeenCalledWith({ id: 'session-1' }, { invalidated: true });
        expect(deleteFromCache).toHaveBeenCalledWith('other-token-1');
        expect(deleteFromCache).toHaveBeenCalledWith('other-token-2');
    });

    it("ends all the user's own sessions including the current one, but never an acting session", async () => {
        userService.getUserById.mockResolvedValue({ id: 'user-1' });
        const own = makeSession({ id: 'session-1', token: 'own-token' });
        const acting = makeSession({
            id: 'session-2',
            token: 'acting-token',
            customFields: { actingAdministratorId: '7' },
        });
        repo.find.mockResolvedValue([own, acting]);

        const ok = await service.endAllSessions(ctxFor('user-1', 'own-token'));

        expect(ok).toBe(true);
        expect(repo.remove).toHaveBeenCalledWith([own]);
        expect(deleteFromCache).toHaveBeenCalledWith('own-token');
        expect(deleteFromCache).not.toHaveBeenCalledWith('acting-token');
    });

    it('endAllSessions is a no-op when the user cannot be resolved', async () => {
        userService.getUserById.mockResolvedValue(undefined);

        const ok = await service.endAllSessions(ctxFor('user-1'));

        expect(ok).toBe(false);
        expect(repo.remove).not.toHaveBeenCalled();
    });

    it('deleteEndedSessions removes expired and invalidated sessions', async () => {
        queryBuilder.execute.mockResolvedValue({ affected: 3 });

        const deleted = await service.deleteEndedSessions(ctxFor(undefined));

        expect(deleted).toBe(3);
        expect(queryBuilder.where).toHaveBeenCalledWith('expires <= :now OR invalidated = true', {
            now: expect.any(Date),
        });
    });

    it('deleteEndedSessions returns 0 when nothing was affected', async () => {
        queryBuilder.execute.mockResolvedValue({ affected: undefined });

        const deleted = await service.deleteEndedSessions(ctxFor(undefined));

        expect(deleted).toBe(0);
    });
});
