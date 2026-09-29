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

// Same "hand-rolled table matching production schema, real Postgres, no DB mocking" convention as
// counterparty.access-scope.test.ts — VendureEntity's primary column needs a real bootstrap()ped
// EntityIdStrategy, unavailable against a standalone DataSource.
@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) organizationId!: string;
    @Column({ type: 'varchar' }) priceTypeId!: string;
    @Column({ type: 'varchar', nullable: true }) creditLimit!: string | null;
    @Column({ type: 'varchar', nullable: true }) currency!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'boolean', nullable: true }) controlledIndividually!: boolean | null;
    @Column({ type: 'int', nullable: true }) debtDaysLimit!: number | null;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar' }) contractKind!: string;
    @Column({ type: 'varchar', nullable: true }) paymentKind!: string | null;
    @Column({ type: 'int', nullable: true }) paymentDelayDays!: number | null;
    @Column({ type: 'varchar' }) contractType!: string;
    @Column({ type: 'varchar', nullable: true }) brandManufacturerId!: string | null;
}

let dataSource: DataSource;
let service: ContractService;
const ctx = {} as RequestContext;

const { schema, extra } = testSchemaOptions('contract_service');

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

const baseFields = {
    counterpartyId: 'local-cp-1',
    organizationId: 'org-1',
    priceTypeId: 'pt-1',
    isActive: true,
    contractKind: 'СПокупателем',
    contractType: 'ТоварыИУслуги',
    controlledIndividually: false,
    debtDaysLimit: null,
    paymentDelayDays: null,
};

describe('ContractService.upsertActiveState (real Postgres)', () => {
    it('creates a row on the first event', async () => {
        await service.upsertActiveState(ctx, 'erp-contract-1', {
            ...baseFields,
            name: 'General contract',
        });

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-1' } });
        expect(row).not.toBeNull();
        expect(row?.name).toBe('General contract');
        expect(row?.counterpartyId).toBe('local-cp-1');
        expect(row?.isActive).toBe(true);
    });

    it('updates an existing row on a subsequent event', async () => {
        await service.upsertActiveState(ctx, 'erp-contract-2', {
            ...baseFields,
            name: 'Initial name',
            creditLimit: '10000',
            controlledIndividually: true,
        });

        await service.upsertActiveState(ctx, 'erp-contract-2', {
            ...baseFields,
            name: 'Updated name',
            isActive: false,
            creditLimit: '20000',
            controlledIndividually: false,
        });

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-2' } });
        expect(row?.name).toBe('Updated name');
        expect(row?.isActive).toBe(false);
        expect(row?.creditLimit).toBe('20000');
        expect(row?.controlledIndividually).toBe(false);
    });

    // A deletion tombstone never carries a name — a brand-new erpId with no name must be
    // deferred, never fabricated with a blank name (same convention as
    // CounterpartyService.upsertActiveState).
    it('defers creation (does not create) when a tombstone arrives for an erpId never seen before', async () => {
        await service.upsertActiveState(ctx, 'erp-contract-unseen', {
            ...baseFields,
            name: null,
            isActive: false,
        });

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-unseen' } });
        expect(row).toBeNull();
    });

    it('deactivates an already-known contract on a tombstone without touching its name', async () => {
        await service.upsertActiveState(ctx, 'erp-contract-3', {
            ...baseFields,
            name: 'Real contract',
        });

        await service.upsertActiveState(ctx, 'erp-contract-3', {
            ...baseFields,
            name: null,
            isActive: false,
        });

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-3' } });
        expect(row?.name).toBe('Real contract');
        expect(row?.isActive).toBe(false);
    });

    it('findByErpId returns null for an unknown erpId', async () => {
        expect(await service.findByErpId(ctx, 'nope')).toBeNull();
    });
});

describe('ContractService.deactivateTombstone (real Postgres)', () => {
    it('deactivates an existing row by erpId without touching its other fields', async () => {
        await service.upsertActiveState(ctx, 'erp-contract-4', {
            ...baseFields,
            name: 'Real contract',
            creditLimit: '5000',
        });

        await service.deactivateTombstone(ctx, 'erp-contract-4');

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-4' } });
        expect(row?.isActive).toBe(false);
        expect(row?.name).toBe('Real contract');
        expect(row?.creditLimit).toBe('5000');
    });

    it('is a no-op for an erpId never seen before — never fabricates a row', async () => {
        await service.deactivateTombstone(ctx, 'erp-contract-unseen-2');

        const row = await dataSource
            .getRepository(TestContract)
            .findOne({ where: { erpId: 'erp-contract-unseen-2' } });
        expect(row).toBeNull();
    });
});
