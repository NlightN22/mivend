import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContractService } from '../../contract.service';

@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'boolean', nullable: true }) isCustomerContract!: boolean | null;
}

let dataSource: DataSource;
let service: ContractService;
const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('my_contracts');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestContract],
        synchronize: true,
    });
    await dataSource.initialize();
    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestContract),
    } as unknown as TransactionalConnection;
    service = new ContractService(connectionShim);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestContract).clear();
});

describe('ContractService.findActiveCustomerContracts', () => {
    it('returns only active customer contracts of the given counterparty', async () => {
        await dataSource.getRepository(TestContract).save([
            {
                erpId: 'own',
                counterpartyId: '1',
                name: 'A',
                isActive: true,
                isCustomerContract: true,
            },
            {
                erpId: 'own-inactive',
                counterpartyId: '1',
                name: 'B',
                isActive: false,
                isCustomerContract: true,
            },
            {
                erpId: 'own-supplier',
                counterpartyId: '1',
                name: 'C',
                isActive: true,
                isCustomerContract: false,
            },
            {
                erpId: 'own-unknown',
                counterpartyId: '1',
                name: 'D',
                isActive: true,
                isCustomerContract: null,
            },
            {
                erpId: 'foreign',
                counterpartyId: '2',
                name: 'E',
                isActive: true,
                isCustomerContract: true,
            },
        ]);
        const rows = await service.findActiveCustomerContracts(ctx, '1');
        expect(rows.map(r => r.erpId)).toEqual(['own']);
    });
});
