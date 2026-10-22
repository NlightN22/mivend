import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    Brackets,
    Column,
    DataSource,
    Entity,
    PrimaryGeneratedColumn,
    type SelectQueryBuilder,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { applyCustomerScope } from '../../customer-scope';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) lastName!: string;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
}

const accessScope = {
    resolveCounterpartyScope: vi.fn(),
    managerClause: vi.fn(() => null),
    applyOwnCounterpartyFilter: vi.fn(),
};
const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('counterparty_customer_scope');
let dataSource: DataSource;
let service: CounterpartyService;
const ids: Record<string, number> = {};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCustomer],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new CounterpartyService(
        {
            getRepository: () => dataSource.getRepository(TestCounterparty),
        } as unknown as TransactionalConnection,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        accessScope as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
    const [a, b] = await dataSource.getRepository(TestCounterparty).save([
        {
            erpId: 'cp-a',
            legalName: 'A',
            shortName: 'A',
            assignedManagerId: null,
            branchId: 'branch-a',
        },
        {
            erpId: 'cp-b',
            legalName: 'B',
            shortName: 'B',
            assignedManagerId: null,
            branchId: 'branch-b',
        },
    ]);
    const saved = await dataSource.getRepository(TestCustomer).save([
        { lastName: 'in-a', customFieldsCounterpartyid: String(a.id) },
        { lastName: 'in-b', customFieldsCounterpartyid: String(b.id) },
        { lastName: 'none', customFieldsCounterpartyid: null },
    ]);
    for (const c of saved) ids[c.lastName] = c.id;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function visibleNames(where?: (qb: ReturnType<typeof base>) => void): Promise<string[]> {
    const qb = base();
    where?.(qb);
    const scoped = applyCustomerScope(qb, await service.visibleFilteredQb(ctx, {}));
    return (await scoped.getMany()).map(c => c.lastName).sort();
}

function base(): SelectQueryBuilder<TestCustomer> {
    return dataSource.getRepository(TestCustomer).createQueryBuilder('customer');
}

describe('applyCustomerScope on real Postgres', () => {
    it('keeps only customers of the branch counterparties, never one without a counterparty', async () => {
        accessScope.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            branchId: 'branch-a',
        });
        expect(await visibleNames()).toEqual(['in-a']);
    });

    it('an OR filter in its own brackets cannot widen the scope', async () => {
        accessScope.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            branchId: 'branch-a',
        });
        const names = await visibleNames(qb =>
            qb.where(
                new Brackets(w =>
                    w
                        .where('customer.lastName = :x', { x: 'in-b' })
                        .orWhere('customer.lastName = :y', { y: 'none' }),
                ),
            ),
        );
        expect(names).toEqual([]);
    });

    it('a branch without clients sees no customer, and counts agree', async () => {
        accessScope.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            branchId: 'branch-z',
        });
        const qb = applyCustomerScope(base(), await service.visibleFilteredQb(ctx, {}));
        expect(await qb.getManyAndCount()).toEqual([[], 0]);
    });
});
