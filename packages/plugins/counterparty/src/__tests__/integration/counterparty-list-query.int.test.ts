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
import type { CounterpartyFilterParameter } from '../../counterparty-list-query';

// Hand-rolled tables with the columns the filter reads stand in for the Vendure entities.
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
const mockCtx = {} as RequestContext;
const scope = vi.fn(async () => ({ kind: 'all' }) as Record<string, unknown>);
const accessScope = { resolveCounterpartyScope: scope, managerClause: vi.fn(() => null) };

const { schema, extra } = testSchemaOptions('counterparty_list_query');

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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    scope.mockResolvedValue({ kind: 'all' });
    await dataSource.getRepository(TestErpUser).clear();
    await dataSource.getRepository(TestCounterparty).clear();
    await dataSource.getRepository(TestErpUser).save({ erpId: 'm-1', fullName: 'Pat Example' });
    const base = { legalName: 'L', phone: '+10000000', officialEmail: 'a@example.test' };
    await dataSource.getRepository(TestCounterparty).save([
        {
            ...base,
            erpId: 'a',
            shortName: 'Alpha Trade',
            inn: '111',
            branchId: 'branch-a',
            managerErpId: 'm-1',
            erpGroupLabel: 'Wholesale',
        },
        {
            ...base,
            erpId: 'b',
            shortName: 'Beta 100% Trade',
            inn: '222',
            branchId: 'branch-b',
            managerErpId: 'm-2',
        },
        {
            ...base,
            erpId: 'c',
            shortName: 'Gamma_Trade',
            inn: null,
            branchId: null,
            officialEmail: null,
            isActive: false,
        },
        { ...base, erpId: 'd', shortName: 'Delta', inn: '444', branchId: 'branch-a', phone: '' },
    ]);
});

async function erpIds(filter: CounterpartyFilterParameter): Promise<string[]> {
    const page = await service.findVisiblePage(mockCtx, { filter, take: 50 });
    return page.items.map(c => c.erpId).sort();
}

describe('counterparty list filter: group label and INN status', () => {
    beforeEach(async () => {
        const base = { legalName: 'L', phone: '+10000000', officialEmail: 'a@example.test' };
        await dataSource.getRepository(TestCounterparty).save([
            { ...base, erpId: 'e', shortName: 'Epsilon', inn: '1-11', erpGroupLabel: 'Retail' },
            { ...base, erpId: 'f', shortName: 'Zeta', inn: '111', isActive: false },
        ]);
    });

    it('matches the group label case-insensitively and by exact value', async () => {
        expect(await erpIds({ erpGroupLabel: { eq: 'wholesale' } })).toEqual(['a']);
        expect(await erpIds({ erpGroupLabel: { contains: 'ret' } })).toEqual(['e']);
        expect(await erpIds({ erpGroupLabel: { isNull: true } })).toEqual(['b', 'c', 'd', 'f']);
    });

    it('derives the INN status like the list field: blank is missing, active twins are duplicates', async () => {
        expect(await erpIds({ innStatus: { eq: 'missing' } })).toEqual(['c']);
        expect(await erpIds({ innStatus: { eq: 'duplicate' } })).toEqual(['a', 'e']);
        expect(await erpIds({ innStatus: { in: ['ok'] } })).toEqual(['b', 'd', 'f']);
        expect(await erpIds({ innStatus: { notEq: 'ok' } })).toEqual(['a', 'c', 'e']);
    });

    it('rejects an operator the INN status does not offer', async () => {
        await expect(erpIds({ innStatus: { contains: 'dup' } })).rejects.toThrow(/Unsupported/);
    });
});

describe('counterparty list filter (shared engine)', () => {
    it('contains is case-insensitive and treats % and _ as literal characters', async () => {
        expect(await erpIds({ shortName: { contains: 'trade' } })).toEqual(['a', 'b', 'c']);
        expect(await erpIds({ shortName: { contains: '100%' } })).toEqual(['b']);
        expect(await erpIds({ shortName: { contains: 'Delt_' } })).toEqual([]);
        expect(await erpIds({ shortName: { contains: 'a%' } })).toEqual([]);
    });

    it('notContains keeps rows with an empty value', async () => {
        expect(await erpIds({ inn: { notContains: '1' } })).toEqual(['b', 'c', 'd']);
    });

    it('eq and notEq compare the whole value without regard to case', async () => {
        expect(await erpIds({ shortName: { eq: 'delta' } })).toEqual(['d']);
        expect(await erpIds({ shortName: { notEq: 'delta' } })).toEqual(['a', 'b', 'c']);
    });

    it('isNull treats an empty string like a missing value', async () => {
        expect(await erpIds({ phone: { isNull: true } })).toEqual(['d']);
        expect(await erpIds({ officialEmail: { isNull: false } })).toEqual(['a', 'b', 'd']);
        expect(await erpIds({ inn: { isNull: true } })).toEqual(['c']);
    });

    it('branchId matches exactly, in and notIn include or exclude the listed branches', async () => {
        expect(await erpIds({ branchId: { eq: 'branch-a' } })).toEqual(['a', 'd']);
        expect(await erpIds({ branchId: { in: ['branch-a', 'branch-b'] } })).toEqual([
            'a',
            'b',
            'd',
        ]);
        expect(await erpIds({ branchId: { notIn: ['branch-a'] } })).toEqual(['b', 'c']);
        expect(await erpIds({ branchId: { isNull: true } })).toEqual(['c']);
        expect(await erpIds({ branchId: { in: [] } })).toEqual([]);
    });

    it('manager contains matches the ERP id or the ERP-reported name', async () => {
        expect(await erpIds({ managerErpId: { contains: 'pat ex' } })).toEqual(['a']);
        expect(await erpIds({ managerErpId: { contains: 'm-' } })).toEqual(['a', 'b']);
        expect(await erpIds({ managerErpId: { isNull: true } })).toEqual(['c', 'd']);
    });

    it('isActive filters on the ERP flag', async () => {
        expect(await erpIds({ isActive: { eq: false } })).toEqual(['c']);
        expect(await erpIds({ isActive: { eq: true } })).toEqual(['a', 'b', 'd']);
    });

    it('conditions combine with and, including repeated conditions on one field', async () => {
        expect(
            await erpIds({
                shortName: { contains: 'trade' },
                _and: [{ shortName: { notContains: 'beta' } }, { branchId: { eq: 'branch-a' } }],
            }),
        ).toEqual(['a']);
    });

    it('combines with the legacy list arguments and the readiness chip', async () => {
        const page = await service.findVisiblePage(mockCtx, {
            readiness: 'ready',
            filter: { branchId: { eq: 'branch-a' } },
            take: 50,
        });
        expect(page.items.map(c => c.erpId)).toEqual(['a']);
        expect(page.totalItems).toBe(1);
    });

    it('never widens the visibility scope', async () => {
        scope.mockResolvedValue({ kind: 'department', branchId: 'branch-a' });
        expect(await erpIds({ shortName: { contains: 'trade' } })).toEqual(['a']);
        expect(await erpIds({ branchId: { in: ['branch-a', 'branch-b'] } })).toEqual(['a', 'd']);
        expect(await erpIds({ branchId: { isNull: true } })).toEqual([]);
        const counted = await service.findVisiblePage(mockCtx, { filter: {}, take: 0 });
        expect(counted.totalItems).toBe(2);
    });

    describe('hostile input', () => {
        it('a quote or SQL fragment is only ever a value', async () => {
            expect(
                await erpIds({ shortName: { contains: `x'; DROP TABLE counterparty; --` } }),
            ).toEqual([]);
            expect(await erpIds({ shortName: { eq: `' OR '1'='1` } })).toEqual([]);
            expect(await dataSource.getRepository(TestCounterparty).count()).toBe(4);
        });

        it('rejects regex and any operator outside the whitelist', async () => {
            await expect(
                erpIds({ shortName: { regex: '.*' } } as unknown as CounterpartyFilterParameter),
            ).rejects.toThrow(/Unsupported filter operator/);
            await expect(
                erpIds({ shortName: { gt: 'a' } } as unknown as CounterpartyFilterParameter),
            ).rejects.toThrow(/Unsupported filter operator/);
        });

        it('rejects a malformed filter shape as user input, not an internal error', async () => {
            for (const bad of [{ _and: {} }, { _and: [null] }, { shortName: 'x' }, { _and: 'x' }]) {
                await expect(erpIds(bad as unknown as CounterpartyFilterParameter)).rejects.toThrow(
                    /Invalid/,
                );
            }
        });

        it('rejects _or and non-object operators or items', async () => {
            await expect(
                erpIds({ _or: [{ inn: { eq: '1' } }] } as unknown as CounterpartyFilterParameter),
            ).rejects.toThrow(/_or/);
            await expect(
                erpIds({ inn: { in: 'x' } } as unknown as CounterpartyFilterParameter),
            ).rejects.toThrow(/Invalid/);
        });

        it('rejects a field outside the whitelist', async () => {
            await expect(
                erpIds({ creditLimit: { eq: '1' } } as unknown as CounterpartyFilterParameter),
            ).rejects.toThrow(/Unknown filter field/);
        });

        it('rejects a contains on the exact branch id', async () => {
            await expect(erpIds({ branchId: { contains: 'a' } })).rejects.toThrow(/Unsupported/);
        });

        it('rejects oversized values, lists, condition counts and nesting', async () => {
            await expect(erpIds({ shortName: { eq: 'x'.repeat(201) } })).rejects.toThrow();
            await expect(
                erpIds({ branchId: { in: Array.from({ length: 101 }, (_, i) => `b${i}`) } }),
            ).rejects.toThrow(/At most/);
            const many = Array.from({ length: 21 }, () => ({ shortName: { contains: 'a' } }));
            await expect(erpIds({ _and: many })).rejects.toThrow(/At most/);
            const deep: CounterpartyFilterParameter = {
                _and: [{ _and: [{ _and: [{ _and: [{ _and: [{}] }] }] }] }],
            };
            await expect(erpIds(deep)).rejects.toThrow(/nested/);
        });
    });
});
