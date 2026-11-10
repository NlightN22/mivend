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

import { createContactTables } from './contact-tables.fixture';

import {
    parseCounterpartyMatching,
    resolveCounterpartyIds,
} from '../../counterparty-bulk-matching';
import { CounterpartyService } from '../../counterparty.service';

// Same stand-in tables as counterparty-activation-filter.int.test.ts (VendureEntity cannot run standalone).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
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
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

const { schema, extra } = testSchemaOptions('counterparty_bulk_matching');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: CounterpartyService;
let scope: { kind: string; branchId?: string } = { kind: 'all' };

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
    await createContactTables(dataSource, 'int');
    const connection = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
    } as unknown as TransactionalConnection;
    const accessScope = {
        resolveCounterpartyScope: vi.fn(async () => scope),
        managerClause: vi.fn(() => null),
    };
    service = new CounterpartyService(
        connection,
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

beforeEach(async () => {
    scope = { kind: 'all' };
    await dataSource.getRepository(TestCustomer).clear();
    await dataSource.getRepository(TestCounterparty).clear();
    const base = { inn: '7700000000', phone: '+10000000', officialEmail: 'a@example.test' };
    const rows = Array.from({ length: 30 }, (_, i) => ({
        ...base,
        erpId: `e-${i}`,
        legalName: `Legal ${i}`,
        shortName: `${i % 3 === 0 ? 'Alpha' : 'Beta'} ${i}`,
        branchId: i < 20 ? 'branch-a' : 'branch-b',
        isActive: i % 5 !== 0,
        officialEmail: i % 7 === 0 ? null : base.officialEmail,
    }));
    const saved = await dataSource.getRepository(TestCounterparty).save(rows);
    await dataSource
        .getRepository(TestCustomer)
        .save({ customFieldsCounterpartyid: String(saved[1].id), deletedAt: null });
});

async function resolve(matching: Record<string, unknown>, limit = 100): Promise<string[]> {
    return resolveCounterpartyIds(service, ctx, parseCounterpartyMatching(matching), limit);
}

async function listIds(matching: Record<string, unknown>): Promise<string[]> {
    const m = parseCounterpartyMatching(matching);
    const page = await service.findVisiblePage(ctx, { ...m, take: 100 });
    return page.items.map(c => String(c.id));
}

describe('counterparty bulk matching resolves exactly what the list shows', () => {
    it('equals the list for search, readiness and the builder filter, and for their combination', async () => {
        const cases: Array<Record<string, unknown>> = [
            {},
            { search: 'alpha' },
            { readiness: 'ready' },
            { readiness: 'missing-data' },
            { readiness: 'erp-inactive' },
            { readiness: 'activated' },
            { filter: { branchId: { eq: 'branch-b' } } },
            { search: 'beta', readiness: 'ready', filter: { branchId: { eq: 'branch-a' } } },
        ];
        for (const matching of cases) {
            const ids = await resolve(matching);
            expect([...ids].sort()).toEqual((await listIds(matching)).sort());
        }
        expect((await resolve({ readiness: 'ready' })).length).toBeGreaterThan(0);
        expect(await resolve({})).toHaveLength(30);
    });

    it('returns ids ascending and honours the limit', async () => {
        const ids = await resolve({}, 7);
        expect(ids).toHaveLength(7);
        expect(ids.map(Number)).toEqual([...ids.map(Number)].sort((a, b) => a - b));
    });

    it('never includes a record outside the caller scope, whatever the filter says', async () => {
        scope = { kind: 'department', branchId: 'branch-a' };
        const ids = await resolve({ filter: { branchId: { eq: 'branch-b' } } });
        expect(ids).toEqual([]);
        const all = await resolve({});
        expect(all).toHaveLength(20);
        const branchB = await dataSource
            .getRepository(TestCounterparty)
            .findBy({ branchId: 'branch-b' });
        expect(all.filter(id => branchB.some(r => String(r.id) === id))).toEqual([]);
    });

    it('rejects unknown selection keys, unknown filter fields and unknown readiness', async () => {
        await expect(resolve({ ids: ['1'] })).rejects.toThrow(/Unknown selection field/);
        await expect(resolve({ filter: { passwordHash: { eq: 'x' } } })).rejects.toThrow(
            /Unknown filter field/,
        );
        await expect(resolve({ readiness: 'nope' })).rejects.toThrow(/Unknown readiness/);
        await expect(resolve({ search: 5 })).rejects.toThrow(/Invalid search/);
    });
});
