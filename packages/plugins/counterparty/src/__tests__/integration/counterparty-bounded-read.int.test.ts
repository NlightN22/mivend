import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import {
    QueryTooLargeError,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

const CEILING = 5;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('counterparty_bounded_read');
let dataSource: DataSource;
let service: CounterpartyService;

async function seed(count: number): Promise<void> {
    const repo = dataSource.getRepository(TestCounterparty);
    await repo.clear();
    await repo.save(
        Array.from({ length: count }, (_, i) => ({
            erpId: `cp-${i}`,
            legalName: 'L',
            shortName: `Name ${i}`,
        })),
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty],
        synchronize: true,
    });
    await dataSource.initialize();
    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
    } as unknown as TransactionalConnection;
    const accessScope = {
        resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })),
        managerClause: vi.fn(() => null),
    };
    service = new CounterpartyService(
        connectionShim,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        accessScope as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('findVisible bounded read', () => {
    beforeEach(() => seed(0));

    it('returns every row when the set is exactly at the ceiling', async () => {
        await seed(CEILING);
        expect(await service.findVisible(mockCtx, CEILING)).toHaveLength(CEILING);
    });

    it('throws QUERY_TOO_LARGE instead of truncating when one row exceeds the ceiling', async () => {
        await seed(CEILING + 1);
        const failure = await service.findVisible(mockCtx, CEILING).catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(QueryTooLargeError);
        expect((failure as QueryTooLargeError).extensions).toMatchObject({
            code: 'QUERY_TOO_LARGE',
            ceiling: CEILING,
        });
    });
});
