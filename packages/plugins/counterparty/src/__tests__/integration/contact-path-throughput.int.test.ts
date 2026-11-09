import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
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
import { ContactPoint } from '../../entities/contact-point.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyContactPoint } from '../../entities/counterparty-contact-point.entity';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}
@Entity('contact_point')
class TestPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) value!: string;
    @Column({ type: 'varchar', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'boolean', default: true }) isUsable!: boolean;
    @Column({ type: 'varchar', nullable: true }) label!: string | null;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
    @Column({ type: 'varchar', nullable: true }) comment!: string | null;
    @Column({ type: 'varchar', default: 'manual' }) source!: string;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
}
@Entity('counterparty_contact_point')
class TestLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

const stand = new Map<unknown, unknown>([
    [Counterparty, TestCounterparty],
    [ContactPoint, TestPoint],
    [CounterpartyContactPoint, TestLink],
]);
const { schema, extra } = testSchemaOptions('contact_path_throughput');
let dataSource: DataSource;
const COUNT = 300;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestPoint, TestLink],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `INSERT INTO counterparty ("erpId") SELECT 'cp-' || g FROM generate_series(1, ${COUNT}) g`,
    );
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// Reference measurement for the burst of counterparty events carrying contact_infos (docs/ai/erp-streams-map.md).
describe('contact path throughput (real Postgres)', () => {
    it('applies counterparty contact_infos sequentially and idempotently on replay', async () => {
        const base = createTestConnection(dataSource);
        const connection = {
            withTransaction: base.withTransaction.bind(base),
            getRepository: (c: never, entity: unknown) =>
                base.getRepository(c, (stand.get(entity) ?? entity) as never),
        } as unknown as TransactionalConnection;
        const service = new ContactPointService(connection);
        const apply = async (): Promise<number> => {
            const started = performance.now();
            for (let i = 1; i <= COUNT; i++) {
                await service.replaceErpPointsByErpId(
                    testRequestContext,
                    'counterparty',
                    `cp-${i}`,
                    [
                        {
                            type: 'phone',
                            value: `+7912${String(i).padStart(7, '0')}`,
                            isPrimary: true,
                        },
                        { type: 'email', value: `c${i}@example.com` },
                        { type: 'address', value: `Street ${i}` },
                    ],
                );
            }
            return COUNT / ((performance.now() - started) / 1000);
        };
        const first = await apply();
        const replay = await apply();
        console.log(
            `contact path: ${first.toFixed(0)} rows/s first apply, ${replay.toFixed(0)} rows/s replay`,
        );
        expect(await dataSource.query('SELECT count(*)::int AS n FROM contact_point')).toEqual([
            { n: COUNT * 3 },
        ]);
        expect(first).toBeGreaterThan(46);
    });
});
