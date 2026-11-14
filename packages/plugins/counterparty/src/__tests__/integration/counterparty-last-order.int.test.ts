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

import { loadLastOrderDates } from '../../counterparty-last-order.sql';
import { CounterpartyService } from '../../counterparty.service';
import type { CounterpartyFilterParameter } from '../../counterparty-list-query';
import type { CounterpartySortParameter } from '../../types';

// Hand-rolled tables stand in for the Vendure entities (VendureEntity cannot run on a standalone DataSource).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'timestamp', nullable: true }) orderPlacedAt!: Date | null;
}

const { schema, extra } = testSchemaOptions('counterparty_last_order');
const ctx = {} as RequestContext;
const scope = vi.fn(async () => ({ kind: 'all' }) as Record<string, unknown>);
const accessScope = { resolveCounterpartyScope: scope, managerClause: vi.fn(() => null) };
let dataSource: DataSource;
let service: CounterpartyService;
const ids: Record<string, number> = {};

const day = (d: number): Date => new Date(Date.UTC(2026, 0, d));

async function names(options: {
    filter?: CounterpartyFilterParameter;
    sort?: CounterpartySortParameter;
}): Promise<string[]> {
    const page = await service.findVisiblePage(ctx, { ...options, take: 50 });
    return page.items.map(c => c.shortName);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCustomer, TestOrder],
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
        accessScope as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    scope.mockResolvedValue({ kind: 'all' });
    await dataSource.query('TRUNCATE "order", customer, counterparty RESTART IDENTITY');
    const base = { legalName: 'L' };
    const saved = await dataSource.getRepository(TestCounterparty).save([
        { ...base, erpId: 'a', shortName: 'Alpha', branchId: 'branch-a' },
        { ...base, erpId: 'b', shortName: 'Beta', branchId: 'branch-a' },
        { ...base, erpId: 'c', shortName: 'Gamma', branchId: 'branch-a' },
        { ...base, erpId: 'd', shortName: 'Delta', branchId: 'branch-b' },
        { ...base, erpId: 'e', shortName: 'Epsilon', branchId: 'branch-a' },
    ]);
    saved.forEach(c => (ids[c.erpId] = c.id));
    const customers = await dataSource
        .getRepository(TestCustomer)
        .save(['a', 'b', 'd', 'e'].map(k => ({ customFieldsCounterpartyid: String(ids[k]) })));
    const [ca, cb, cd, ce] = customers.map(c => c.id);
    await dataSource.getRepository(TestOrder).save([
        { customerId: ca, orderPlacedAt: day(5) },
        { customerId: ca, orderPlacedAt: day(20) },
        { customerId: ca, orderPlacedAt: null },
        { customerId: cb, orderPlacedAt: day(10) },
        { customerId: cd, orderPlacedAt: day(25) },
        // Draft only: never placed, so Epsilon counts as never ordered.
        { customerId: ce, orderPlacedAt: null },
        // The order's own counterparty wins over its customer's.
        { customerId: cb, customFieldsCounterpartyid: String(ids.c), orderPlacedAt: day(15) },
    ]);
});

describe('counterparty lastOrderAt filter', () => {
    const lastOrderAt = (op: Record<string, unknown>): CounterpartyFilterParameter => ({
        lastOrderAt: op,
    });

    it('before keeps counterparties whose last order is earlier', async () => {
        expect((await names({ filter: lastOrderAt({ before: day(16) }) })).sort()).toEqual([
            'Beta',
            'Gamma',
        ]);
    });

    it('after keeps counterparties whose last order is later', async () => {
        expect((await names({ filter: lastOrderAt({ after: day(16) }) })).sort()).toEqual([
            'Alpha',
            'Delta',
        ]);
    });

    it('between is half-open on the end', async () => {
        const between = { start: day(10), end: day(20) };
        expect((await names({ filter: lastOrderAt({ between }) })).sort()).toEqual([
            'Beta',
            'Gamma',
        ]);
    });

    it('isNull true finds never-ordered ones and false the rest', async () => {
        expect(await names({ filter: lastOrderAt({ isNull: true }) })).toEqual(['Epsilon']);
        expect(await names({ filter: lastOrderAt({ isNull: false }) })).toHaveLength(4);
    });

    it('never returns an out-of-scope counterparty, whatever the date says', async () => {
        scope.mockResolvedValue({ kind: 'department', branchId: 'branch-a' });
        const all = await names({ filter: lastOrderAt({ after: day(1) }) });
        expect(all).not.toContain('Delta');
        expect(await names({ filter: lastOrderAt({ after: day(24) }) })).toEqual([]);
    });
});

describe('counterparty lastOrderAt sort', () => {
    it('ascending puts never-ordered last', async () => {
        const sort = { lastOrderAt: 'ASC' } as const;
        expect(await names({ sort })).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta', 'Epsilon']);
    });

    it('descending still puts never-ordered last', async () => {
        const sort = { lastOrderAt: 'DESC' } as const;
        expect(await names({ sort })).toEqual(['Delta', 'Alpha', 'Gamma', 'Beta', 'Epsilon']);
    });

    it('pages by the sort key', async () => {
        const page = await service.findVisiblePage(ctx, {
            sort: { lastOrderAt: 'DESC' },
            take: 2,
            skip: 1,
        });
        expect(page.items.map(c => c.shortName)).toEqual(['Alpha', 'Gamma']);
        expect(page.totalItems).toBe(5);
    });
});

describe('counterparty lastOrderAt sort with many equal keys', () => {
    it('pages 65 rows in small pages without repeating or skipping any', async () => {
        await dataSource.getRepository(TestCounterparty).save(
            Array.from({ length: 60 }, (_, i) => ({
                legalName: 'L',
                erpId: `tie-${i}`,
                shortName: `Tied ${String(i).padStart(2, '0')}`,
                branchId: 'branch-a',
            })),
        );
        const seen: string[] = [];
        for (const sort of ['ASC', 'DESC'] as const) {
            seen.length = 0;
            for (let skip = 0; skip < 80; skip += 7) {
                const page = await service.findVisiblePage(ctx, {
                    sort: { lastOrderAt: sort },
                    take: 7,
                    skip,
                });
                seen.push(...page.items.map(c => c.shortName));
            }
            expect(seen).toHaveLength(65);
            expect(new Set(seen).size).toBe(65);
        }
    });
});

describe('loadLastOrderDates', () => {
    const connection = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
    } as unknown as TransactionalConnection;

    it('returns the latest placed order per counterparty and nothing for none', async () => {
        const found = await loadLastOrderDates(
            connection,
            ctx,
            ['a', 'b', 'c', 'e'].map(k => String(ids[k])),
        );
        expect(found.get(String(ids.a))).toEqual(day(20));
        expect(found.get(String(ids.b))).toEqual(day(10));
        expect(found.get(String(ids.c))).toEqual(day(15));
        expect(found.has(String(ids.e))).toBe(false);
    });

    it('ignores counterparties outside the requested ids', async () => {
        const found = await loadLastOrderDates(connection, ctx, [String(ids.d)]);
        expect([...found.keys()]).toEqual([String(ids.d)]);
    });
});
