import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type {
    ConfigService,
    RequestContext,
    TransactionalConnection,
    UserService,
    SessionService,
} from '@vendure/core';
import { SessionManagementService } from '../../session-management.service';

// Same hand-rolled-table approach as packages/plugins/documents' integration test
// (Vendure's real Session/AuthenticatedSession entities need a bootstrap-registered
// EntityIdStrategy to get a primary column, which a standalone DataSource doesn't have).
@Entity('authenticated_session')
class TestAuthenticatedSession {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) token!: string;
    @Column({ type: 'varchar' }) userId!: string;
    @Column({ type: 'boolean', default: false }) invalidated!: boolean;
    @Column({ type: 'timestamp' }) expires!: Date;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
    @Column({ type: 'simple-json', nullable: true }) customFields!: {
        userAgent?: string | null;
    } | null;
}

let dataSource: DataSource;
let service: SessionManagementService;
let deleteFromCache: ReturnType<typeof vi.fn>;
let userService: { getUserById: ReturnType<typeof vi.fn> };
let sessionService: { deleteSessionsByUser: ReturnType<typeof vi.fn> };

function ctxFor(userId: string, currentToken?: string): RequestContext {
    return {
        activeUserId: userId,
        session: currentToken ? { token: currentToken } : undefined,
    } as unknown as RequestContext;
}

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [TestAuthenticatedSession],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    // The service queries with `{ user: { id: userId } }`, which TypeORM's real
    // AuthenticatedSession resolves via its `user` relation. Our flat test table has
    // no relation, so the shim rewrites that filter shape to the flat `userId` column.
    const repo = dataSource.getRepository(TestAuthenticatedSession);
    const shimRepo = {
        find: (opts: { where?: Record<string, unknown>; order?: unknown }) =>
            repo.find({ ...opts, where: flattenWhere(opts.where) } as never),
        findOne: (opts: { where?: Record<string, unknown> }) =>
            repo.findOne({ where: flattenWhere(opts.where) } as never),
        update: (criteria: Record<string, unknown>, partial: Record<string, unknown>) =>
            repo.update(criteria as never, partial as never),
    };

    function flattenWhere(where: Record<string, unknown> | undefined): Record<string, unknown> {
        if (!where) return {};
        const { user, ...rest } = where as { user?: { id: string } };
        return user ? { ...rest, userId: user.id } : rest;
    }

    const connectionShim = {
        getRepository: () => shimRepo,
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    deleteFromCache = vi.fn();
    const configService = {
        authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
    } as unknown as ConfigService;
    userService = { getUserById: vi.fn() };
    sessionService = { deleteSessionsByUser: vi.fn() };

    service = new SessionManagementService(
        connectionShim,
        configService,
        userService as unknown as UserService,
        sessionService as unknown as SessionService,
    );
});

afterAll(async () => {
    await dataSource.destroy();
});

beforeEach(async () => {
    await dataSource.getRepository(TestAuthenticatedSession).clear();
    deleteFromCache.mockReset();
});

describe('SessionManagementService (integration, real Postgres)', () => {
    it('lists both sessions for a user who logged in twice, marking the current one', async () => {
        const repo = dataSource.getRepository(TestAuthenticatedSession);
        await repo.save([
            repo.create({
                token: 'tok-a',
                userId: 'user-1',
                expires: futureDate(),
                customFields: { userAgent: 'Chrome' },
            }),
            repo.create({
                token: 'tok-b',
                userId: 'user-1',
                expires: futureDate(),
                customFields: { userAgent: 'Firefox' },
            }),
        ]);

        const result = await service.getMySessions(ctxFor('user-1', 'tok-a'));

        expect(result).toHaveLength(2);
        expect(result.find(s => s.userAgent === 'Chrome')?.current).toBe(true);
        expect(result.find(s => s.userAgent === 'Firefox')?.current).toBe(false);
    });

    it('ending a session invalidates it in the DB and evicts it from the session cache', async () => {
        const repo = dataSource.getRepository(TestAuthenticatedSession);
        const saved = await repo.save(
            repo.create({ token: 'tok-c', userId: 'user-1', expires: futureDate() }),
        );

        const ok = await service.endSession(ctxFor('user-1'), saved.id);

        expect(ok).toBe(true);
        const reloaded = await repo.findOneByOrFail({ id: saved.id });
        expect(reloaded.invalidated).toBe(true);
        expect(deleteFromCache).toHaveBeenCalledWith('tok-c');
    });

    it('"end other sessions" never invalidates the session used to make the request', async () => {
        const repo = dataSource.getRepository(TestAuthenticatedSession);
        await repo.save([
            repo.create({ token: 'current', userId: 'user-1', expires: futureDate() }),
            repo.create({ token: 'other', userId: 'user-1', expires: futureDate() }),
        ]);

        await service.endOtherSessions(ctxFor('user-1', 'current'));

        const current = await repo.findOneByOrFail({ token: 'current' });
        const other = await repo.findOneByOrFail({ token: 'other' });
        expect(current.invalidated).toBe(false);
        expect(other.invalidated).toBe(true);
    });
});

function futureDate(): Date {
    return new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
}
