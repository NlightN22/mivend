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

import { CounterpartyService } from '../../counterparty.service';
import { CounterpartySuggestService } from '../../counterparty-suggest.service';
import type { CounterpartyFilterParameter } from '../../counterparty-list-query';

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
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'bigint', default: 0 }) creditLimit!: number;
    @Column({ type: 'bigint', default: 0 }) creditBalance!: number;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

let dataSource: DataSource;
let service: CounterpartyService;
let suggestions: CounterpartySuggestService;
const canReadCredit = vi.fn(() => true);
const ctx = { userHasPermissions: () => canReadCredit() } as unknown as RequestContext;
const scope = vi.fn(async () => ({ kind: 'all' }) as Record<string, unknown>);
const accessScope = { resolveCounterpartyScope: scope, managerClause: vi.fn(() => null) };

const { schema, extra } = testSchemaOptions('counterparty_list_credit_suggest');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestErpUser, TestCustomer],
        synchronize: true,
    });
    await dataSource.initialize();
    await createContactTables(dataSource, 'uuid');
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
    suggestions = new CounterpartySuggestService(service);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    scope.mockResolvedValue({ kind: 'all' });
    canReadCredit.mockReturnValue(true);
    await dataSource.getRepository(TestCustomer).clear();
    await dataSource.getRepository(TestCounterparty).clear();
    const base = { legalName: 'L', phone: '+10000000', officialEmail: 'a@example.test' };
    await dataSource.getRepository(TestCounterparty).save([
        {
            ...base,
            erpId: 'a',
            shortName: 'Alpha Trade',
            inn: '7701',
            branchId: 'branch-a',
            creditLimit: 1000,
            creditBalance: 900,
        },
        {
            ...base,
            erpId: 'b',
            shortName: 'Alpine 100% Trade',
            inn: '7702',
            branchId: 'branch-b',
            creditLimit: 500,
            creditBalance: 0,
        },
        {
            ...base,
            erpId: 'c',
            shortName: 'Alp_Trade',
            inn: null,
            branchId: 'branch-a',
            isActive: false,
        },
    ]);
});

async function erpIds(filter: CounterpartyFilterParameter): Promise<string[]> {
    const page = await service.findVisiblePage(ctx, { filter, take: 50 });
    return page.items.map(c => c.erpId).sort();
}

describe('counterparty list filter and sort by credit', () => {
    it('filters by limit and balance', async () => {
        expect(await erpIds({ creditLimit: { gte: 600 } })).toEqual(['a']);
        expect(await erpIds({ creditBalance: { between: { start: 1, end: 900 } } })).toEqual(['a']);
        expect(await erpIds({ creditLimit: { gt: 0 }, creditBalance: { eq: 0 } })).toEqual(['b']);
    });

    it('sorts by balance', async () => {
        const sort = { creditBalance: 'DESC' } as const;
        const page = await service.findVisiblePage(ctx, { sort, take: 50 });
        expect(page.items[0].erpId).toBe('a');
    });

    it('refuses a caller without the credit permission, filter or sort', async () => {
        canReadCredit.mockReturnValue(false);
        await expect(erpIds({ creditLimit: { gt: 0 } })).rejects.toThrow();
        await expect(erpIds({ _and: [{ creditBalance: { gt: 0 } }] })).rejects.toThrow();
        const sort = { creditLimit: 'ASC' } as const;
        await expect(service.findVisiblePage(ctx, { sort })).rejects.toThrow();
        expect(await erpIds({ isActive: { eq: true } })).toEqual(['a', 'b']);
    });

    it('stays inside the visibility scope', async () => {
        scope.mockResolvedValue({ kind: 'department', branchId: 'branch-a' });
        expect(await erpIds({ creditLimit: { gt: 0 } })).toEqual(['a']);
    });
});

describe('counterparty list filter by portal readiness', () => {
    it('matches the inactive and the activated state', async () => {
        const a = await dataSource.getRepository(TestCounterparty).findOneByOrFail({ erpId: 'a' });
        await dataSource.getRepository(TestCustomer).save({ customFieldsCounterpartyid: a.id });
        expect(await erpIds({ readiness: { eq: 'erp-inactive' } })).toEqual(['c']);
        expect(await erpIds({ readiness: { eq: 'activated' } })).toEqual(['a']);
        const rest = { readiness: { notIn: ['activated', 'erp-inactive'] } };
        expect(await erpIds(rest)).toEqual(['b']);
    });
});

describe('counterparty filter suggestions', () => {
    it('suggests names by prefix, ignoring case', async () => {
        expect(await suggestions.suggest(ctx, 'shortName', 'AL')).toEqual([
            'Alp_Trade',
            'Alpha Trade',
            'Alpine 100% Trade',
        ]);
    });

    it('suggests INNs and skips rows without one', async () => {
        expect(await suggestions.suggest(ctx, 'inn', '77')).toEqual(['7701', '7702']);
    });

    it('treats LIKE wildcards in the prefix literally', async () => {
        expect(await suggestions.suggest(ctx, 'shortName', 'Alp_')).toEqual(['Alp_Trade']);
        expect(await suggestions.suggest(ctx, 'shortName', '%%')).toEqual([]);
    });

    it('answers nothing for a one-character prefix and bounds the answer', async () => {
        expect(await suggestions.suggest(ctx, 'shortName', 'A')).toEqual([]);
        expect(await suggestions.suggest(ctx, 'shortName', 'Al', 2)).toHaveLength(2);
    });

    it('offers only fields on the whitelist', async () => {
        await expect(suggestions.suggest(ctx, 'legalName', 'Al')).rejects.toThrow();
    });

    it('stays inside the visibility scope', async () => {
        scope.mockResolvedValue({ kind: 'department', branchId: 'branch-b' });
        expect(await suggestions.suggest(ctx, 'shortName', 'Al')).toEqual(['Alpine 100% Trade']);
        expect(await suggestions.suggest(ctx, 'inn', '77')).toEqual(['7702']);
    });
});
