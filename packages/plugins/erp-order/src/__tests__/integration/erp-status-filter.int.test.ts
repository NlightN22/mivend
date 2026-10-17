import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { andErpStatusFilter } from '../../erp-status-filter';

// Replica of the Order table: the real entity needs a bootstrapped Vendure to load.
@Entity('order')
class TOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ name: 'customFieldsErpstatus', type: 'varchar', nullable: true })
    erpStatus!: string | null;
}

const { schema, extra } = testSchemaOptions('erp_status_filter');
let dataSource: DataSource;

async function codes(
    filter: Parameters<typeof andErpStatusFilter>[1],
): Promise<Array<string | null>> {
    const qb = dataSource.getRepository(TOrder).createQueryBuilder('order').orderBy('order.id');
    andErpStatusFilter(qb, filter);
    return (await qb.getMany()).map(row => row.erpStatus);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TOrder],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource
        .getRepository(TOrder)
        .save(['NEW', 'DELIVERED', 'CANCELLED', null].map(erpStatus => ({ erpStatus })));
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('andErpStatusFilter (real SQL)', () => {
    it('notIn drops the listed final statuses and keeps orders with no status', async () => {
        expect(await codes({ notIn: ['DELIVERED', 'CANCELLED'] })).toEqual(['NEW', null]);
    });

    it('in keeps only the listed statuses, never a null one', async () => {
        expect(await codes({ in: ['NEW', 'DELIVERED'] })).toEqual(['NEW', 'DELIVERED']);
    });

    it('an empty notIn adds no restriction', async () => {
        expect(await codes({ notIn: [] })).toEqual(['NEW', 'DELIVERED', 'CANCELLED', null]);
    });
});
