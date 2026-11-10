import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ContactPointService } from '../../contact-point.service';
import { resolveContactPoints } from '../../contact-point-normalize';
import { ContactPoint } from '../../entities/contact-point.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyContactPoint } from '../../entities/counterparty-contact-point.entity';
import type { ContactPointInput } from '../../contact-point-normalize';

// VendureEntity needs bootstrap() for its id column, so a bare DataSource uses table-shaped stand-ins.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}

@Entity('contact_point')
class TestContactPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) value!: string;
    @Column({ type: 'varchar', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'boolean', default: true }) isUsable!: boolean;
    @Column({ type: 'varchar', nullable: true }) label!: string | null;
    @Column({ type: 'varchar', nullable: true }) comment!: string | null;
    @Column({ type: 'varchar', default: 'manual' }) source!: string;
    @UpdateDateColumn() updatedAt!: Date;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
}

@Entity('counterparty_contact_point')
@Index(['counterpartyId', 'contactPointId'], { unique: true })
class TestLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @ManyToOne(() => TestContactPoint, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contactPointId' })
    contactPoint!: TestContactPoint;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

const stand = new Map<unknown, unknown>([
    [Counterparty, TestCounterparty],
    [ContactPoint, TestContactPoint],
    [CounterpartyContactPoint, TestLink],
]);
const { schema, extra } = testSchemaOptions('contact_point_service');
let dataSource: DataSource;
let service: ContactPointService;
const ctx = testRequestContext;

function mapped(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (stand.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestContactPoint, TestLink],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new ContactPointService(mapped(createTestConnection(dataSource)));
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE counterparty_contact_point, contact_point, counterparty RESTART IDENTITY CASCADE',
    );
    await dataSource.query(`INSERT INTO counterparty ("erpId") VALUES ('cp-1'), ('cp-2')`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const phone = (value: string, isPrimary = false): ContactPointInput => ({
    type: 'phone',
    value,
    isPrimary,
});
const rows = (
    owner = 1,
): Promise<Array<{ normalizedValue: string; source: string; isPrimary: boolean }>> =>
    dataSource.query(
        `SELECT p."normalizedValue", p.source, l."isPrimary" FROM counterparty_contact_point l
         JOIN contact_point p ON p.id = l."contactPointId" WHERE l."counterpartyId" = $1 ORDER BY p."normalizedValue"`,
        [owner],
    );

describe('ContactPointService (real Postgres)', () => {
    it('applies the same list twice with one result and keeps the row uuids stable', async () => {
        const list = [
            phone('+79120000001', true),
            { type: 'email' as const, value: 'a@example.com' },
        ];
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', list);
        const before = await dataSource.query('SELECT uuid FROM contact_point ORDER BY id');
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', list);
        expect(await dataSource.query('SELECT uuid FROM contact_point ORDER BY id')).toEqual(
            before,
        );
        expect(await rows()).toHaveLength(2);
    });

    it('replaces the ERP set and keeps manual rows, an equal manual row staying manual', async () => {
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', [
            phone('+79120000001'),
            phone('+79120000002'),
        ]);
        await dataSource.query(
            `INSERT INTO contact_point (type, value, "normalizedValue", source) VALUES ('phone', '+79120000009', '+79120000009', 'manual'), ('phone', '+79120000003', '+79120000003', 'manual')`,
        );
        await dataSource.query(
            `INSERT INTO counterparty_contact_point ("counterpartyId", "contactPointId") SELECT 1, id FROM contact_point WHERE source = 'manual'`,
        );

        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', [
            phone('+79120000002'),
            phone('+79120000003'),
        ]);

        expect(await rows()).toEqual([
            { normalizedValue: '+79120000002', source: 'erp', isPrimary: false },
            { normalizedValue: '+79120000003', source: 'manual', isPrimary: false },
            { normalizedValue: '+79120000009', source: 'manual', isPrimary: false },
        ]);
    });

    it('moves the primary flag between channels without creating or changing channel rows', async () => {
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', [
            phone('+79120000001', true),
            phone('+79120000002'),
        ]);
        const before = await dataSource.query(
            'SELECT id, "updatedAt" FROM contact_point ORDER BY id',
        );
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', [
            phone('+79120000001'),
            phone('+79120000002', true),
        ]);
        expect(await rows()).toEqual([
            { normalizedValue: '+79120000001', source: 'erp', isPrimary: false },
            { normalizedValue: '+79120000002', source: 'erp', isPrimary: true },
        ]);
        expect(
            await dataSource.query('SELECT id, "updatedAt" FROM contact_point ORDER BY id'),
        ).toEqual(before);
    });

    it('does not touch updatedAt of an unchanged channel on replay', async () => {
        const list = [phone('+79120000001', true)];
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', list);
        const before = await dataSource.query('SELECT "updatedAt" FROM contact_point');
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', list);
        expect(await dataSource.query('SELECT "updatedAt" FROM contact_point')).toEqual(before);
    });

    it('an explicitly empty list removes ERP rows only, and another owner is untouched', async () => {
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', [phone('+79120000001')]);
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-2', [phone('+79120000001')]);
        await service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', []);
        expect(await rows(1)).toEqual([]);
        expect(await rows(2)).toHaveLength(1);
    });

    it('returns false for an owner that is not stored', async () => {
        expect(
            await service.replaceErpPointsByErpId(ctx, 'counterparty', 'nope', [
                phone('+79120000001'),
            ]),
        ).toBe(false);
    });

    it('concurrent writers of one owner end with exactly the last-applied set, without duplicates', async () => {
        const a = [phone('+79120000001'), phone('+79120000002')];
        const b = [phone('+79120000002'), phone('+79120000003')];
        await Promise.all([
            ...Array.from({ length: 4 }, () =>
                service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', a),
            ),
            ...Array.from({ length: 4 }, () =>
                service.replaceErpPointsByErpId(ctx, 'counterparty', 'cp-1', b),
            ),
        ]);
        const got = (await rows()).map(r => r.normalizedValue);
        const expected = [a, b].map(l =>
            resolveContactPoints(l)
                .map(p => p.normalizedValue as string)
                .sort(),
        );
        expect(expected).toContainEqual(got);
        expect(await dataSource.query('SELECT count(*)::int AS n FROM contact_point')).toEqual([
            { n: 2 },
        ]);
    });

    it('a failed contact step (aborted SQL statement) rolls back alone and the master write commits', async () => {
        const connection = mapped(createTestConnection(dataSource));
        const failure = await connection.withTransaction(ctx, async txCtx => {
            await connection
                .getRepository(txCtx, Counterparty)
                .save({ erpId: 'cp-master' } as never);
            return service.guarded(txCtx, 'counterparty cp-master', async () => {
                const links = connection.getRepository(txCtx, CounterpartyContactPoint);
                await dataSource.query(
                    `INSERT INTO contact_point (type, value, source) VALUES ('phone', '+79120000001', 'erp')`,
                );
                await links.insert({ counterpartyId: 1, contactPointId: 1 } as never);
                await links.insert({ counterpartyId: 1, contactPointId: 1 } as never);
            });
        });
        expect(failure).toMatch(/^contact step failed: /);
        expect(
            await dataSource.query(`SELECT "erpId" FROM counterparty WHERE "erpId" = 'cp-master'`),
        ).toEqual([{ erpId: 'cp-master' }]);
        expect(
            await dataSource.query('SELECT count(*)::int AS n FROM counterparty_contact_point'),
        ).toEqual([{ n: 0 }]);
    });

    it('reports no failure when the step succeeds', async () => {
        const connection = mapped(createTestConnection(dataSource));
        const failure = await connection.withTransaction(ctx, txCtx =>
            service.guarded(txCtx, 'x', async () => undefined),
        );
        expect(failure).toBeNull();
    });

    it('a reader of the chosen e-mail during concurrent ERP replaces always sees one whole set', async () => {
        const email = (value: string): ContactPointInput => ({
            type: 'email',
            value,
            isPrimary: true,
        });
        await service.replaceErpPoints(ctx, 'counterparty', 1, [email('a@example.test')]);
        const writes = ['b', 'c', 'd', 'e'].map(n =>
            service.replaceErpPoints(ctx, 'counterparty', 1, [email(`${n}@example.test`)]),
        );
        const reads = Array.from({ length: 8 }, () => service.chosenContacts(ctx, [1]));
        const seen = await Promise.all(reads);
        await Promise.all(writes);
        for (const m of seen) expect(m.get('1')?.email).toMatch(/^[a-e]@example\.test$/);
        const rows = await dataSource.query(
            `SELECT count(*)::int AS n FROM counterparty_contact_point WHERE "counterpartyId" = 1`,
        );
        expect(rows[0].n).toBe(1);
    });
});
