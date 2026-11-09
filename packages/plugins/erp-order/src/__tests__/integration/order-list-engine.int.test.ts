import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import type { AccessScope } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderListService } from '../../order-list.service';
import { OrderVisibilityService } from '../../order-visibility.service';
import type { OrderListInput } from '../../order-list-query';

import {
    TestCustomer,
    TestFulfillment,
    TestLine,
    TestOrder,
    counterpartySchema,
} from './order-list.fixtures';

const { schema, extra } = testSchemaOptions('order_list_engine');
let dataSource: DataSource;
let scope: AccessScope;
let service: OrderListService;
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder, TestCustomer, TestLine, TestFulfillment, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty_team_member ("counterpartyId" varchar, "administratorId" varchar)`,
    );
    const realScope = new AccessScopeService({} as never, {} as never, {} as never);
    const visibility = new OrderVisibilityService(
        {} as never,
        {
            resolveOrderScope: async () => scope,
            applyOwnCounterpartyFilter: realScope.applyOwnCounterpartyFilter.bind(realScope),
            managerClause: realScope.managerClause.bind(realScope),
        } as unknown as AccessScopeService,
        { getGlobalDefaultBranchId: async () => 'branch-default' } as never,
    );
    service = new OrderListService(
        {
            getRepository: () => dataSource.getRepository(TestOrder),
        } as unknown as TransactionalConnection,
        visibility,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const day = (n: number): Date => new Date(Date.UTC(2026, 0, n));
const cps: Record<string, string> = {};

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", customer, counterparty, counterparty_team_member, order_line, fulfillment RESTART IDENTITY CASCADE',
    );
    for (const [key, manager] of [
        ['mine', 'm-1'],
        ['other', 'm-2'],
    ] as const) {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "shortName") VALUES ($1, $2, $3) RETURNING id`,
            [`cp-${key}`, manager, `Company ${key}`],
        );
        cps[key] = String(row.id);
    }
    const customer = await dataSource
        .getRepository(TestCustomer)
        .save({ counterpartyId: cps.mine });
    const orders = dataSource.getRepository(TestOrder);
    const base = { counterpartyId: cps.mine, customerId: customer.id };
    await orders.save([
        {
            ...base,
            code: 'A1',
            createdAt: day(1),
            orderPlacedAt: day(1),
            subTotalWithTax: 100,
            erpStatus: 'PENDING',
            reservationState: 'RESERVED',
            placedBy: '2',
        },
        {
            ...base,
            code: 'A2',
            createdAt: day(2),
            orderPlacedAt: day(2),
            subTotalWithTax: 300,
            shippingWithTax: 50,
            state: 'Cancelled',
            erpStatus: 'REJECTED',
            hasCheckFindings: true,
        },
        {
            ...base,
            code: 'B1',
            createdAt: day(3),
            subTotalWithTax: 200,
            state: 'Delivered',
            failureReason: 'INSUFFICIENT_STOCK',
            reservationState: 'FAILED',
            placedBy: '3',
        },
        { code: 'Z9', createdAt: day(4), counterpartyId: cps.other, subTotalWithTax: 50 },
    ]);
    await dataSource.getRepository(TestLine).save([{ orderId: 1 }, { orderId: 1 }]);
    await dataSource.getRepository(TestFulfillment).save([{ orderId: 1 }]);
});

async function codes(list: OrderListInput, search?: string): Promise<string[]> {
    return (await service.findVisible(ctx, list, undefined, undefined, search)).items.map(
        o => o.code,
    );
}

describe('visibleOrders on the shared list engine (real Postgres)', () => {
    beforeEach(() => {
        scope = { kind: 'all' } as AccessScope;
    });

    it('applies the caller scope before any filter', async () => {
        scope = { kind: 'own', administratorId: 'm-1' } as AccessScope;
        expect(await codes({})).toEqual(['B1', 'A2', 'A1']);
        expect(await codes({ filter: { code: { eq: 'Z9' } } })).toEqual([]);
        scope = { kind: 'own', administratorId: 'nobody' } as AccessScope;
        expect(await codes({})).toEqual([]);
    });

    it('filters by every whitelisted column', async () => {
        const cases: Array<[string, OrderListInput['filter'], string[]]> = [
            ['code contains', { code: { contains: 'a' } }, ['A2', 'A1']],
            ['code notEq', { code: { notEq: 'A1' } }, ['Z9', 'B1', 'A2']],
            ['createdAt after', { createdAt: { after: day(2).toISOString() } }, ['Z9', 'B1']],
            [
                'createdAt between',
                {
                    createdAt: {
                        between: { start: day(1).toISOString(), end: day(3).toISOString() },
                    },
                },
                ['A2', 'A1'],
            ],
            ['orderPlacedAt isNull', { orderPlacedAt: { isNull: true } }, ['Z9', 'B1']],
            ['state in', { state: { in: ['Cancelled', 'Delivered'] } }, ['B1', 'A2']],
            ['state notIn', { state: { notIn: ['PaymentSettled'] } }, ['B1', 'A2']],
            ['total gt (with shipping)', { totalWithTax: { gt: 340 } }, ['A2']],
            [
                'total between',
                { totalWithTax: { between: { start: 100, end: 200 } } },
                ['B1', 'A1'],
            ],
            ['placedBy eq', { placedByAdministratorId: { eq: '2' } }, ['A1']],
            ['placedBy isNull', { placedByAdministratorId: { isNull: true } }, ['Z9', 'A2']],
            [
                'reservationState in',
                { reservationState: { in: ['FAILED', 'RESERVED'] } },
                ['B1', 'A1'],
            ],
            ['failure reason set', { reservationFailureReason: { isNull: false } }, ['B1']],
            ['erpStatus in', { erpStatus: { in: ['REJECTED'] } }, ['A2']],
            ['hasCheckFindings', { hasCheckFindings: { eq: true } }, ['A2']],
            [
                '_and of two on one field',
                { _and: [{ totalWithTax: { gt: 60 } }, { totalWithTax: { lt: 250 } }] },
                ['B1', 'A1'],
            ],
        ];
        for (const [name, filter, expected] of cases) {
            expect(await codes({ filter }), name).toEqual(expected);
        }
    });

    it('keeps search, managerId and customerId working with the filter', async () => {
        expect(
            await codes({ filter: { state: { eq: 'PaymentSettled' } } }, 'Company mine'),
        ).toEqual(['A1']);
        const byManager = await service.findVisible(ctx, {}, 'm-2');
        expect(byManager.items.map(o => o.code)).toEqual(['Z9']);
    });

    it('answers take: 0 with the filtered total and no rows', async () => {
        const r = await service.findVisible(ctx, {
            take: 0,
            filter: { state: { eq: 'Cancelled' } },
        });
        expect(r).toEqual({ items: [], totalItems: 1 });
    });

    it('pages with skip and take and reports the total of the whole filtered set', async () => {
        const r = await service.findVisible(ctx, { skip: 1, take: 2 });
        expect(r.totalItems).toBe(4);
        expect(r.items.map(o => o.code)).toEqual(['B1', 'A2']);
    });

    it('loads the lines and fulfillments of the page rows', async () => {
        const r = await service.findVisible(ctx, { filter: { code: { eq: 'A1' } } });
        expect(r.items[0].lines).toHaveLength(2);
        expect(r.items[0].fulfillments).toHaveLength(1);
    });

    it('sorts by every sortable column, NULLs last, newest first on ties', async () => {
        expect(await codes({ sort: { code: 'ASC' } })).toEqual(['A1', 'A2', 'B1', 'Z9']);
        expect(await codes({ sort: { totalWithTax: 'DESC' } })).toEqual(['A2', 'B1', 'A1', 'Z9']);
        expect(await codes({ sort: { state: 'ASC' } })).toEqual(['A2', 'B1', 'Z9', 'A1']);
        expect(await codes({ sort: { createdAt: 'ASC' } })).toEqual(['A1', 'A2', 'B1', 'Z9']);
        expect(await codes({ sort: { orderPlacedAt: 'DESC' } })).toEqual(['A2', 'A1', 'Z9', 'B1']);
    });

    it('rejects an unknown sort field, an unknown filter field and hostile shapes', async () => {
        const reject = async (list: unknown): Promise<unknown> =>
            service.findVisible(ctx, list as OrderListInput).then(
                () => 'ok',
                (e: Error) => e.message,
            );
        expect(await reject({ sort: { id: 'ASC' } })).toMatch(/Cannot sort/);
        expect(await reject({ filter: { id: { eq: 1 } } })).toMatch(/Unknown filter field/);
        expect(await reject({ filter: { _or: [{ state: { eq: 'x' } }] } })).toMatch(/_or/);
        expect(await reject({ filter: { state: { in: 'Cancelled' } } })).toMatch(
            /Invalid filter value/,
        );
        expect(await reject({ filter: { state: { in: { 0: 'a' } } } })).toMatch(
            /Invalid filter value/,
        );
        expect(await reject({ filter: { state: 'Cancelled' } })).toMatch(/Invalid operators/);
        expect(await reject({ filter: { _and: 'x' } })).toMatch(/Invalid _and/);
        expect(await reject({ filter: { code: { regex: '.*' } } })).toMatch(
            /Unsupported filter operator/,
        );
        expect(await reject({ filter: { state: { eq: "x' OR 1=1 --" } } })).toBe('ok');
        expect(await reject({ filter: { code: { contains: 'x'.repeat(201) } } })).toMatch(
            /Invalid filter value/,
        );
        expect(await reject({ filter: { state: { in: Array(101).fill('a') } } })).toMatch(
            /At most 100/,
        );
        const many = Array.from({ length: 21 }, () => ({ state: { eq: 'a' } }));
        expect(await reject({ filter: { _and: many } })).toMatch(/At most 20/);
    });

    it('treats an injected string as a plain value', async () => {
        expect(await codes({ filter: { state: { eq: "x' OR 1=1 --" } } })).toEqual([]);
    });

    it('clamps take to 200 and a negative skip to 0', async () => {
        const r = await service.findVisible(ctx, { skip: -5, take: 100000 });
        expect(r.items).toHaveLength(4);
    });
});
