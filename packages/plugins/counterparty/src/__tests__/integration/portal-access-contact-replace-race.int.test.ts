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
import type { ContactPointInput } from '../../contact-point-normalize';
import { CounterpartyPortalAccessService } from '../../counterparty-portal-access.service';
import { ContactPoint } from '../../entities/contact-point.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyContactPoint } from '../../entities/counterparty-contact-point.entity';

// VendureEntity needs bootstrap(), so table-shaped stand-ins serve the real service on a bare DataSource.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) shortName!: string | null;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
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
const { schema, extra } = testSchemaOptions('portal_access_contact_race');
const ctx = testRequestContext;
const ROUNDS = 6;
let dataSource: DataSource;
let contacts: ContactPointService;
let access: CounterpartyPortalAccessService;
const createdWith: string[] = [];

const email = (value: string): ContactPointInput => ({ type: 'email', value, isPrimary: true });
const phone: ContactPointInput = { type: 'phone', value: '+7 900 000-00-01', isPrimary: true };

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
    await dataSource.query(`CREATE TABLE customer (id serial PRIMARY KEY,
        "customFieldsCounterpartyid" varchar, "deletedAt" timestamp)`);
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (stand.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
    contacts = new ContactPointService(connection);
    const customerService = {
        create: async (
            c: { em: DataSource['manager'] },
            input: { emailAddress: string; customFields: { counterpartyId: string } },
        ) => {
            createdWith.push(input.emailAddress);
            const rows: Array<{ id: number }> = await c.em.query(
                `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
                [input.customFields.counterpartyId],
            );
            return { id: rows[0].id };
        },
    };
    access = new CounterpartyPortalAccessService(
        connection,
        customerService as never,
        { assertCounterpartyWritable: async () => undefined } as never,
        contacts,
    );
}, 30_000);

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    createdWith.length = 0;
    await dataSource.query(
        'TRUNCATE counterparty_contact_point, contact_point, counterparty, customer RESTART IDENTITY CASCADE',
    );
});

describe('portal activation while the ERP replaces the same counterparty channels', () => {
    it('activates with the old or the new e-mail, never a torn set, and surfaces every error', async () => {
        for (let i = 1; i <= ROUNDS; i++) {
            await dataSource.query(
                `INSERT INTO counterparty ("erpId", "shortName", "fullName", inn) VALUES ($1, 'Name', 'Full', $2)`,
                [`cp-${i}`, `770000000${i}`],
            );
            await contacts.replaceErpPoints(ctx, 'counterparty', i, [
                email('old@example.test'),
                phone,
            ]);
        }
        const settled = await Promise.allSettled(
            Array.from({ length: ROUNDS }, (_, k) => k + 1).flatMap(id => [
                access.activate(ctx, id),
                contacts.replaceErpPoints(ctx, 'counterparty', id, [
                    email('new@example.test'),
                    phone,
                ]),
            ]),
        );
        const failures = settled.filter(r => r.status === 'rejected');
        expect(failures.map(f => String((f as PromiseRejectedResult).reason))).toEqual([]);
        expect(createdWith).toHaveLength(ROUNDS);
        for (const used of createdWith) {
            expect(['old@example.test', 'new@example.test']).toContain(used);
        }
        const links = await dataSource.query(
            `SELECT "counterpartyId", count(*)::int AS n FROM counterparty_contact_point
             GROUP BY "counterpartyId"`,
        );
        expect(links.map((l: { n: number }) => l.n)).toEqual(Array(ROUNDS).fill(2));
        const chosen = await contacts.chosenContacts(ctx, [1, 2, 3, 4, 5, 6]);
        for (const value of chosen.values()) expect(value.email).toBe('new@example.test');
    });
});
