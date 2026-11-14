import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';

// Vendure's VendureEntity needs bootstrap(), so the real Counterparty cannot run on a standalone
// DataSource; a hand-rolled table with the columns the list filter reads stands in for it.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('contact_point')
class TestContactPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'boolean', default: true }) isUsable!: boolean;
}

@Entity('counterparty_contact_point')
class TestCounterpartyContactPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @Column({ type: 'uuid' }) counterpartyId!: string;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

let dataSource: DataSource;
let service: CounterpartyService;
const mockCtx = {} as RequestContext;
const mockAccessScopeService = {
    resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })),
    managerClause: vi.fn(() => null),
};

const { schema, extra } = testSchemaOptions('counterparty_activation_filter');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCustomer, TestContactPoint, TestCounterpartyContactPoint],
        synchronize: true,
    });
    await dataSource.initialize();
    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
    } as unknown as TransactionalConnection;
    service = new CounterpartyService(
        connectionShim,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        mockAccessScopeService as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE counterparty_contact_point, contact_point, customer RESTART IDENTITY',
    );
    await dataSource.getRepository(TestCounterparty).clear();
});

async function seed(): Promise<void> {
    const repo = dataSource.getRepository(TestCounterparty);
    const base = { phone: '+10000000', officialEmail: 'a@example.test' };
    const [, , , , activated] = await repo.save([
        {
            ...base,
            erpId: 'ready-a',
            inn: '770000001',
            legalName: 'L1',
            shortName: 'Ready A',
            branchId: 'branch-a',
        },
        {
            ...base,
            erpId: 'ready-none',
            inn: '770000002',
            legalName: 'L2',
            shortName: 'Ready None',
            branchId: null,
        },
        {
            ...base,
            erpId: 'missing-phone',
            inn: '770000003',
            legalName: 'L3',
            shortName: 'Missing Phone',
            phone: '',
            branchId: 'branch-b',
        },
        {
            ...base,
            erpId: 'inactive',
            inn: '770000004',
            legalName: 'L4',
            shortName: 'Inactive',
            isActive: false,
            officialEmail: null,
            branchId: 'branch-a',
        },
        {
            ...base,
            erpId: 'activated',
            inn: '770000005',
            legalName: 'L5',
            shortName: 'Activated',
            branchId: null,
        },
    ]);
    const customers = dataSource.getRepository(TestCustomer);
    await customers.save([
        { customFieldsCounterpartyid: activated.id, deletedAt: null },
        // A soft-deleted portal customer does not count as activated.
        {
            customFieldsCounterpartyid: (await repo.findOneByOrFail({ erpId: 'ready-a' })).id,
            deletedAt: new Date(),
        },
    ]);
}

async function erpIds(
    options: Parameters<CounterpartyService['findVisiblePage']>[1],
): Promise<string[]> {
    const page = await service.findVisiblePage(mockCtx, { ...options, take: 50 });
    return page.items.map(c => c.erpId).sort();
}

async function addChannel(
    erpId: string,
    type: string,
    usable: boolean,
    isPrimary = false,
): Promise<void> {
    const owner = await dataSource.getRepository(TestCounterparty).findOneByOrFail({ erpId });
    const point = await dataSource
        .getRepository(TestContactPoint)
        .save({ type, normalizedValue: usable ? `${type}-${erpId}` : null, isUsable: usable });
    await dataSource
        .getRepository(TestCounterpartyContactPoint)
        .save({ contactPointId: point.id, counterpartyId: owner.id, isPrimary });
}

describe('counterparty list filter for portal activation', () => {
    it('readiness reads the contact channels, the legacy columns only when no channel exists', async () => {
        await seed();
        // missing-phone gets usable channels of both types: ready now.
        await addChannel('missing-phone', 'phone', true);
        await addChannel('missing-phone', 'email', true);
        // ready-a has a phone channel that is unusable: the legacy phone no longer counts.
        await addChannel('ready-a', 'phone', false);
        expect(await erpIds({ readiness: 'ready' })).toEqual(['missing-phone', 'ready-none']);
        expect(await erpIds({ readiness: 'missing-data' })).toEqual(['ready-a']);
    });

    it('branchId narrows to the branch', async () => {
        await seed();
        expect(await erpIds({ branchId: 'branch-a' })).toEqual(['inactive', 'ready-a']);
    });

    it('branchUnassigned selects rows with no branch and wins over branchId', async () => {
        await seed();
        expect(await erpIds({ branchUnassigned: true })).toEqual(['activated', 'ready-none']);
        expect(await erpIds({ branchUnassigned: true, branchId: 'branch-a' })).toEqual([
            'activated',
            'ready-none',
        ]);
    });

    it.each([
        ['ready', ['ready-a', 'ready-none']],
        ['missing-data', ['missing-phone']],
        ['erp-inactive', ['inactive']],
        ['activated', ['activated']],
    ])('readiness %s selects exactly its rows', async (readiness, expected) => {
        await seed();
        expect(await erpIds({ readiness })).toEqual(expected);
    });

    it('the four readiness states partition the table', async () => {
        await seed();
        const counts = await Promise.all(
            ['ready', 'missing-data', 'erp-inactive', 'activated'].map(
                async readiness =>
                    (await service.findVisiblePage(mockCtx, { readiness, take: 0 })).totalItems,
            ),
        );
        expect(counts).toEqual([2, 1, 1, 1]);
    });

    it('take 0 returns only the count', async () => {
        await seed();
        const page = await service.findVisiblePage(mockCtx, { take: 0 });
        expect(page).toEqual({ items: [], totalItems: 5 });
    });

    it('combines readiness with the branch filter', async () => {
        await seed();
        expect(await erpIds({ readiness: 'ready', branchUnassigned: true })).toEqual([
            'ready-none',
        ]);
    });

    it('rejects an unknown readiness value', async () => {
        await expect(service.findVisiblePage(mockCtx, { readiness: 'bogus' })).rejects.toThrow(
            /Unknown readiness/,
        );
    });
});
