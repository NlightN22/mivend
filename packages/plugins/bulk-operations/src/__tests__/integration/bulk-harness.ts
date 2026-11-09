import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import { Column, Entity, Generated, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { withAggregateLock } from 'shared';

import type { BulkExecutor, BulkParameters, BulkRecordVerdict } from '../../bulk-executor';
import { BulkExecutorRegistry } from '../../bulk-executor-registry';
import { BulkBatchQueryService } from '../../bulk-batch-query.service';
import { BulkBatchRunner } from '../../bulk-batch-runner';
import { BulkBatchService } from '../../bulk-batch.service';
import type { BulkRunQueue } from '../../bulk-run-queue';

// Plain TypeORM twins of the production tables (VendureEntity needs a bootstrapped id strategy).
@Entity('bulk_batch')
@Index(['createdById', 'selectionHash'], { unique: true, where: `"status" = 'draft'` })
@Index(['undoOfBatchId'], {
    unique: true,
    where: `"undoOfBatchId" IS NOT NULL AND "status" <> 'draft'`,
})
export class TestBatch {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Index({ unique: true }) @Column({ type: 'uuid' }) uuid!: string;
    @Index({ unique: true }) @Column({ type: 'int' }) @Generated('increment') number!: number;
    @Column({ type: 'varchar' }) operationType!: string;
    @Column({ type: 'jsonb', default: () => "'{}'" }) parameters!: Record<string, unknown>;
    @Column({ type: 'varchar', default: 'draft' }) status!: string;
    @Column({ type: 'varchar' }) createdById!: string;
    @Column({ type: 'int', nullable: true }) undoOfBatchId!: number | null;
    @Column({ type: 'varchar' }) selectionHash!: string;
    @Column({ type: 'int', default: 0 }) totalCount!: number;
    @Column({ type: 'int', default: 0 }) appliedCount!: number;
    @Column({ type: 'int', default: 0 }) skippedCount!: number;
    @Column({ type: 'int', default: 0 }) failedCount!: number;
    @Column({ type: 'timestamp', nullable: true }) startedAt!: Date | null;
    @Column({ type: 'timestamp', nullable: true }) finishedAt!: Date | null;
    @Column({ type: 'text', nullable: true }) errorMessage!: string | null;
}

@Entity('bulk_batch_item')
@Index(['batchId', 'targetId'], { unique: true })
export class TestItem {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'int' }) batchId!: number;
    @Column({ type: 'varchar' }) targetId!: string;
    @Column({ type: 'varchar', nullable: true }) label!: string | null;
    @Column({ type: 'varchar' }) previewOutcome!: string;
    @Column({ type: 'varchar', nullable: true }) previewReasonCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) outcome!: string | null;
    @Column({ type: 'varchar', nullable: true }) reasonCode!: string | null;
    @Column({ type: 'text', nullable: true }) message!: string | null;
}

// The "business data" the fake operation changes; an id absent here is unknown to the operation.
@Entity('fake_target')
export class FakeTarget {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: false }) active!: boolean;
    @Column({ type: 'int', default: 0 }) writes!: number;
}

export interface TestCtx extends Record<string, unknown> {
    em?: EntityManager;
    activeUserId: string;
    userHasPermissions: (permissions: string[]) => boolean;
}

export const FAKE_TYPE = 'fake-activation';

export function ctxFor(userId: string, permitted = true): RequestContext {
    return {
        activeUserId: userId,
        channelId: 1,
        userHasPermissions: () => permitted,
        serialize: () => ({}),
    } as unknown as RequestContext;
}

export function connectionFor(dataSource: DataSource): TransactionalConnection {
    const connection = {
        withTransaction: (ctx: TestCtx, work: (tx: TestCtx) => Promise<unknown>) =>
            ctx.em ? work(ctx) : dataSource.transaction(em => work({ ...ctx, em })),
        getRepository: (ctx: TestCtx, entity: unknown) => {
            const em = ctx.em ?? dataSource.manager;
            return typeof entity === 'function' && dataSource.hasMetadata(entity)
                ? em.getRepository(entity)
                : { query: (sql: string, params?: unknown[]) => em.query(sql, params) };
        },
    };
    return connection as unknown as TransactionalConnection;
}

export interface FakeOptions {
    visible?: (id: string) => boolean;
    failOn?: Set<string>;
    applyDelayMs?: number;
}

// Activates a FakeTarget under a per-row advisory lock and re-reads it there, as a real executor must.
export function fakeExecutor(
    connection: TransactionalConnection,
    options: FakeOptions = {},
): BulkExecutor & { applied: string[] } {
    const visible = options.visible ?? ((): boolean => true);
    const applied: string[] = [];
    const read = (ctx: RequestContext, id: string): Promise<Array<{ active: boolean }>> =>
        connection
            .getRepository(ctx, 'Channel')
            .query('SELECT active FROM fake_target WHERE id = $1', [id]);
    const verdict = (
        outcome: 'applied' | 'skipped',
        reasonCode: string | null,
    ): BulkRecordVerdict => ({
        outcome,
        reasonCode,
        message: reasonCode,
        label: null,
    });
    return {
        applied,
        type: FAKE_TYPE,
        title: 'Fake',
        description: 'Fake',
        area: 'test',
        permission: 'ManageFake',
        validate: (p: BulkParameters) => ({ action: p.action ?? 'activate' }),
        undoPlan: () => ({ type: FAKE_TYPE, parameters: { action: 'deactivate' } }),
        visibleTargets: async (_ctx, ids) => new Set(ids.filter(visible)),
        async resolveMatching(ctx, matching, limit) {
            const rows: Array<{ id: number }> = await connection
                .getRepository(ctx, 'Channel')
                .query(
                    'SELECT id FROM fake_target WHERE ($1::boolean IS NULL OR active = $1) ORDER BY id',
                    [matching.active ?? null],
                );
            return rows
                .map(r => String(r.id))
                .filter(visible)
                .slice(0, limit);
        },
        async inspect(ctx, id) {
            if (!visible(id)) return verdict('skipped', 'out_of_scope');
            const [row] = await read(ctx, id);
            if (!row) return verdict('skipped', 'not_found');
            return row.active ? verdict('skipped', 'already_active') : verdict('applied', null);
        },
        async apply(ctx, id, parameters) {
            if (!visible(id)) return verdict('skipped', 'out_of_scope');
            if (options.failOn?.has(id)) throw new Error(`boom ${id}`);
            return withAggregateLock(connection, ctx, `fake:${id}`, async tx => {
                const [row] = await read(tx, id);
                if (!row) return verdict('skipped', 'not_found');
                const want = parameters.action !== 'deactivate';
                if (row.active === want) return verdict('skipped', 'already_active');
                if (options.applyDelayMs)
                    await new Promise(r => setTimeout(r, options.applyDelayMs));
                await connection
                    .getRepository(tx, 'Channel')
                    .query(
                        'UPDATE fake_target SET active = $2, writes = writes + 1 WHERE id = $1',
                        [id, want],
                    );
                applied.push(id);
                return verdict('applied', null);
            });
        },
    };
}

export interface Stack {
    registry: BulkExecutorRegistry;
    batches: BulkBatchService;
    queries: BulkBatchQueryService;
    runner: BulkBatchRunner;
    enqueued: string[];
}

// The queue stub records enqueues; tests run the runner explicitly, as the worker would.
export function buildStack(connection: TransactionalConnection, executor: BulkExecutor): Stack {
    const registry = new BulkExecutorRegistry();
    registry.register(executor);
    const enqueued: string[] = [];
    const queue = {
        enqueue: async (_ctx: RequestContext, uuid: string) => void enqueued.push(uuid),
    } as unknown as BulkRunQueue;
    const admins = {
        findOneByUserId: async (_ctx: RequestContext, userId: string) => ({
            id: userId.replace('user-', ''),
        }),
    } as unknown as AdministratorService;
    return {
        registry,
        batches: new BulkBatchService(connection, registry, queue, admins),
        queries: new BulkBatchQueryService(connection, registry, admins),
        runner: new BulkBatchRunner(connection, registry),
        enqueued,
    };
}

// Minimal twins of Vendure's rights tables, enough for the runner's per-chunk "still allowed" read.
export async function seedAuth(
    dataSource: DataSource,
    permissions = 'ReadX,ManageFake',
): Promise<void> {
    await dataSource.query(
        `CREATE TABLE IF NOT EXISTS administrator (id int, "userId" int, "deletedAt" timestamp, "firstName" text, "lastName" text)`,
    );
    await dataSource.query(`CREATE TABLE IF NOT EXISTS "user" (id int, "deletedAt" timestamp)`);
    await dataSource.query(
        `CREATE TABLE IF NOT EXISTS user_roles_role ("userId" int, "roleId" int)`,
    );
    await dataSource.query(`CREATE TABLE IF NOT EXISTS role (id int, permissions text)`);
    await dataSource.query(
        `CREATE TABLE IF NOT EXISTS role_channels_channel ("roleId" int, "channelId" int)`,
    );
    await dataSource.query(
        'TRUNCATE administrator, "user", user_roles_role, role, role_channels_channel',
    );
    for (const id of [7, 8]) {
        await dataSource.query('INSERT INTO administrator VALUES ($1, $1, NULL, $2, $3)', [
            id,
            `Admin${id}`,
            'Test',
        ]);
        await dataSource.query('INSERT INTO "user" VALUES ($1, NULL)', [id]);
        await dataSource.query('INSERT INTO user_roles_role VALUES ($1, 1)', [id]);
    }
    await dataSource.query('INSERT INTO role VALUES (1, $1)', [permissions]);
    await dataSource.query('INSERT INTO role_channels_channel VALUES (1, 1)');
}
