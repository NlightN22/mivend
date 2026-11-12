import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    AccessScopeService,
    RoleScopeConfigService,
    VisibilityGrantReader,
} from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyBatchLoaders } from '../../counterparty-batch-loaders.service';
import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';
import { TradingPoint } from '../../entities/trading-point.entity';

// Hand-rolled mirrors: VendureEntity cannot run on a standalone DataSource (see counterparty.access-scope.test.ts).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar', default: 'Address 1' }) address!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @OneToMany(() => TestContact, c => c.tradingPoint) contacts!: TestContact[];
}

@Entity('contact_person')
class TestContact {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @ManyToOne(() => TestTradingPoint, p => p.contacts) tradingPoint!: TestTradingPoint;
}

const { schema, extra } = testSchemaOptions('counterparty_batch_loaders');
const counter = { count: 0 };
let dataSource: DataSource;
let loaders: CounterpartyBatchLoaders;
let counterparties: CounterpartyService;
let scopeOf: Record<string, { roleCodes: string[]; scope: 'own' | 'all'; id: string }>;

const mirrors = new Map<unknown, unknown>([
    [Counterparty, TestCounterparty],
    [TradingPoint, TestTradingPoint],
]);

const adminCtx = (userId: string): RequestContext =>
    ({ apiType: 'admin', activeUserId: userId, channelId: 1 }) as unknown as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestTeamMember, TestTradingPoint, TestContact],
        synchronize: true,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar);
    `);
    for (let i = 1; i <= 30; i++) {
        await dataSource.query(
            'INSERT INTO counterparty ("shortName", "assignedManagerId", "branchId") VALUES ($1, $2, $3)',
            [`cp-${i}`, i % 2 === 0 ? 'admin-a' : 'admin-b', 'branch-a'],
        );
        await dataSource.query('INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1)', [
            String(i),
        ]);
        for (const n of [2, 1]) {
            const [{ id }] = await dataSource.query(
                'INSERT INTO trading_point ("counterpartyId", name, "isActive") VALUES ($1, $2, $3) RETURNING id',
                [String(i), `point-${i}-${n}`, n === 1],
            );
            await dataSource.query(
                'INSERT INTO contact_person (name, "tradingPointId") VALUES ($1, $2)',
                [`contact-${id}`, id],
            );
        }
    }
    scopeOf = {
        'user-a': { roleCodes: ['manager'], scope: 'own', id: 'admin-a' },
        'user-b': { roleCodes: ['manager'], scope: 'own', id: 'admin-b' },
        'user-all': { roleCodes: ['head'], scope: 'all', id: 'admin-all' },
    };
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) => {
            const mirror = mirrors.get(entity);
            if (mirror) return dataSource.getRepository(mirror as never);
            return { query: (sql: string, params?: unknown[]) => dataSource.query(sql, params) };
        },
    } as unknown as TransactionalConnection;
    const accessScope = new AccessScopeService(
        {
            findOneByUserId: async (_c: unknown, userId: string) => ({
                id: scopeOf[userId].id,
                customFields: { branchId: 'branch-a' },
                user: { roles: scopeOf[userId].roleCodes.map(code => ({ code })) },
            }),
        } as unknown as AdministratorService,
        {
            maxScopeFor: async (_c: unknown, roles: Array<{ code: string }>) =>
                roles[0]?.code === 'head' ? 'all' : 'own',
        } as unknown as RoleScopeConfigService,
        { activeManagerIds: async () => [] } as unknown as VisibilityGrantReader,
    );
    loaders = new CounterpartyBatchLoaders(connection, accessScope, {} as never);
    counterparties = new CounterpartyService(
        connection,
        {} as never,
        {} as never,
        accessScope,
        {} as never,
    );
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1));

describe('CounterpartyBatchLoaders', () => {
    it('hidden flags equal the per-row findOneVisible result for each staff scope', async () => {
        for (const user of ['user-a', 'user-b', 'user-all']) {
            const batched = await Promise.all(
                ids(20).map(id => loaders.isHidden(adminCtx(user), id)),
            );
            const perRow = await Promise.all(
                ids(20).map(async id => !(await counterparties.findOneVisible(adminCtx(user), id))),
            );
            expect(batched).toEqual(perRow);
        }
    });

    it('never shows a manager the rows outside the scope, and two users in one tick keep their own', async () => {
        const [a, b] = await Promise.all([
            Promise.all(ids(10).map(id => loaders.isHidden(adminCtx('user-a'), id))),
            Promise.all(ids(10).map(id => loaders.isHidden(adminCtx('user-b'), id))),
        ]);
        expect(a).toEqual(ids(10).map(id => Number(id) % 2 !== 0));
        expect(b).toEqual(ids(10).map(id => Number(id) % 2 === 0));
    });

    it('answers hidden for a counterparty that does not exist', async () => {
        expect(await loaders.isHidden(adminCtx('user-all'), '99999')).toBe(true);
    });

    it('query count for 20 rows is constant (hidden + trading points) and below the per-row path', async () => {
        const ctx = adminCtx('user-a');
        counter.count = 0;
        await Promise.all(ids(20).map(id => loaders.isHidden(ctx, id)));
        await Promise.all(ids(20).map(id => loaders.tradingPoints(ctx, id)));
        const batched = counter.count;
        counter.count = 0;
        const ctx2 = adminCtx('user-a');
        await Promise.all(ids(20).map(id => counterparties.findOneVisible(ctx2, id)));
        const perRow = counter.count;
        expect(batched).toBe(2);
        expect(perRow).toBeGreaterThanOrEqual(20);
        counter.count = 0;
        const ctx3 = adminCtx('user-a');
        await Promise.all(ids(5).map(id => loaders.isHidden(ctx3, id)));
        await Promise.all(ids(5).map(id => loaders.tradingPoints(ctx3, id)));
        expect(counter.count).toBe(batched);
    });

    it('trading points match the per-row query: admin sees inactive ones, shop only active, name order', async () => {
        const repo = dataSource.getRepository(TestTradingPoint);
        for (const apiType of ['admin', 'shop']) {
            const ctx = { ...adminCtx('user-all'), apiType } as unknown as RequestContext;
            const batched = await Promise.all(ids(12).map(id => loaders.tradingPoints(ctx, id)));
            for (const [i, id] of ids(12).entries()) {
                const expected = await repo.find({
                    where: {
                        counterpartyId: id,
                        ...(apiType === 'admin' ? {} : { isActive: true }),
                    },
                    relations: ['contacts'],
                    order: { name: 'ASC' },
                });
                expect(batched[i]).toEqual(expected);
            }
        }
    });

    it('resolves Customer.counterparty in one query with the same row as the per-row SQL', async () => {
        const ctx = adminCtx('user-all');
        counter.count = 0;
        const rows = await Promise.all(ids(20).map(id => loaders.forCustomer(ctx, id)));
        expect(counter.count).toBe(1);
        const [expected] = await dataSource.query(
            `SELECT c.* FROM counterparty c INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text WHERE cu.id = $1`,
            [7],
        );
        expect(rows[6]).toEqual(expected);
        expect(await loaders.forCustomer(ctx, '9999')).toBeNull();
    });
});
