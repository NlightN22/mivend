import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

const { schema, extra } = testSchemaOptions('linked_customer_lookup');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: CounterpartyService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCustomer],
        synchronize: true,
    });
    await dataSource.initialize();
    service = Object.create(CounterpartyService.prototype) as CounterpartyService;
    Object.assign(service, {
        connection: {
            getRepository: () => dataSource.getRepository(TestCustomer),
        } as unknown as TransactionalConnection,
    });
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE customer RESTART IDENTITY');
});

describe('CounterpartyService.getLinkedCustomerId (real Postgres)', () => {
    it('skips a soft-deleted customer that was linked first', async () => {
        await dataSource.getRepository(TestCustomer).save([
            { counterpartyId: '7', deletedAt: new Date('2026-10-04T12:00:00Z') },
            { counterpartyId: '7', deletedAt: null },
        ]);
        expect(String(await service.getLinkedCustomerId(ctx, '7'))).toBe('2');
    });

    it('answers null when every linked customer is deleted or none is linked', async () => {
        await dataSource
            .getRepository(TestCustomer)
            .save({ counterpartyId: '7', deletedAt: new Date() });
        expect(await service.getLinkedCustomerId(ctx, '7')).toBeNull();
        expect(await service.getLinkedCustomerId(ctx, '8')).toBeNull();
    });

    it('is stable when several active customers share the counterparty', async () => {
        await dataSource
            .getRepository(TestCustomer)
            .save([{ counterpartyId: '7' }, { counterpartyId: '7' }]);
        expect(String(await service.getLinkedCustomerId(ctx, '7'))).toBe('1');
    });
});
