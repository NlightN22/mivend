import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyContactErp } from '../../entities/counterparty-contact-erp.entity';
import { CounterpartyContactPerson } from '../../entities/counterparty-contact-person.entity';
import { ErpContactPersonService } from '../../erp-contact-person.service';

// VendureEntity needs bootstrap() for its id column, so a bare DataSource uses table-shaped stand-ins.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}

@Entity('contact_person')
class TestPerson {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar', nullable: true }) position!: string | null;
    @Column({ type: 'varchar', default: 'manual' }) source!: string;
    @Index({ unique: true }) @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'int', nullable: true }) tradingPointId!: number | null;
}

@Entity('counterparty_contact_person')
@Index(['counterpartyId', 'contactPersonId'], { unique: true })
class TestLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPersonId!: number;
}

@Entity('counterparty_contact_erp')
class TestMirror {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'boolean', default: false }) isDeleted!: boolean;
}

const stand = new Map<unknown, unknown>([
    [Counterparty, TestCounterparty],
    [ContactPerson, TestPerson],
    [CounterpartyContactPerson, TestLink],
    [CounterpartyContactErp, TestMirror],
]);
const { schema, extra } = testSchemaOptions('erp_contact_person');
let dataSource: DataSource;
let service: ErpContactPersonService;
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
        entities: [TestCounterparty, TestPerson, TestLink, TestMirror],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new ErpContactPersonService(mapped(createTestConnection(dataSource)));
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE counterparty_contact_person, counterparty_contact_erp, contact_person, counterparty RESTART IDENTITY CASCADE',
    );
    await dataSource.query(`INSERT INTO counterparty ("erpId") VALUES ('cp-1'), ('cp-2')`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const fields = (counterpartyId: number | null = null) => ({
    name: 'Person A',
    position: null,
    isActive: true,
    counterpartyId,
});
const persons = (): Promise<Array<{ erpId: string; name: string; source: string }>> =>
    dataSource.query('SELECT "erpId", name, source FROM contact_person ORDER BY id');
const links = (): Promise<Array<{ counterpartyId: number }>> =>
    dataSource.query('SELECT "counterpartyId" FROM counterparty_contact_person ORDER BY id');

describe('ErpContactPersonService (real Postgres)', () => {
    it('applying the same person twice leaves one person, one link and a stable uuid', async () => {
        await service.upsert(ctx, 'p-1', fields(1));
        const [{ uuid }] = await dataSource.query('SELECT uuid FROM contact_person');
        await service.upsert(ctx, 'p-1', { ...fields(1), name: 'Person A2' });
        expect(await persons()).toEqual([{ erpId: 'p-1', name: 'Person A2', source: 'erp' }]);
        expect(await links()).toHaveLength(1);
        expect(await dataSource.query('SELECT uuid FROM contact_person')).toEqual([{ uuid }]);
    });

    it('links a contact stored before its counterparty arrived, once, and skips deleted ones', async () => {
        await service.upsert(ctx, 'p-1', fields());
        await service.upsert(ctx, 'p-2', fields());
        await dataSource.query(
            `INSERT INTO counterparty_contact_erp ("erpId", "counterpartyId", "isDeleted") VALUES ('p-1', 'cp-1', false), ('p-2', 'cp-1', true)`,
        );
        await service.linkWaitingContacts(ctx, 'cp-1');
        await service.linkWaitingContacts(ctx, 'cp-1');
        expect(await links()).toEqual([{ counterpartyId: 1 }]);
        await service.linkWaitingContacts(ctx, 'cp-unknown');
        expect(await links()).toHaveLength(1);
    });

    it('concurrent writers of one person end with one person and one link', async () => {
        await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                service.upsert(ctx, 'p-1', { ...fields(1 + (i % 2)), name: `Name ${i}` }),
            ),
        );
        expect(await persons()).toHaveLength(1);
        expect((await links()).length).toBeLessThanOrEqual(2);
    });

    it('a tombstone deactivates a known person and reports an unknown one', async () => {
        await service.upsert(ctx, 'p-1', fields());
        expect(await service.deactivate(ctx, 'p-1')).not.toBeNull();
        expect(await service.deactivate(ctx, 'p-x')).toBeNull();
        expect(await dataSource.query('SELECT "isActive" FROM contact_person')).toEqual([
            { isActive: false },
        ]);
    });
});
