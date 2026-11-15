import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { CounterpartyService } from '../../counterparty.service';
import { ContractPowerOfAttorneyErp } from '../../entities/contract-power-of-attorney-erp.entity';
import { PowerOfAttorneyListService } from '../../power-of-attorney-list/power-of-attorney-list.service';

const { schema, extra } = testSchemaOptions('poa_list');
let dataSource: DataSource;
let service: PowerOfAttorneyListService;
let visibleIds: string[] | null = null;
let seesDeleted = false;

const ctx = {
    languageCode: 'en',
    userHasPermissions: () => seesDeleted,
} as unknown as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [ContractPowerOfAttorneyErp],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE counterparty (id serial primary key, "shortName" varchar, "legalName" varchar, inn varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar, "counterpartyId" varchar)`,
    );
    const connection = {
        getRepository: (_ctx: unknown, target: unknown) =>
            dataSource.getRepository(target as never),
    } as unknown as TransactionalConnection;
    const counterparties = {
        visibleIdsSql: async () =>
            visibleIds
                ? {
                      sql: 'SELECT CAST(id AS text) FROM counterparty WHERE CAST(id AS text) = ANY(:visibleIds)',
                      params: { visibleIds },
                  }
                : null,
    } as unknown as CounterpartyService;
    service = new PowerOfAttorneyListService(connection, counterparties);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000);

beforeEach(async () => {
    visibleIds = null;
    seesDeleted = false;
    await dataSource.query(
        'TRUNCATE contract_power_of_attorney_erp, counterparty, contract RESTART IDENTITY',
    );
    await dataSource.query(
        `INSERT INTO counterparty ("shortName","legalName",inn) VALUES ('Customer A','Customer A LLC','111'),('Customer B','Customer B LLC','222')`,
    );
    await dataSource.query(
        `INSERT INTO contract ("erpId",name,"counterpartyId") VALUES ('ct-a','Contract A','1'),('ct-b','Contract B','2'),('ct-gone','Contract Gone','1')`,
    );
    const row = (
        number: string,
        contractId: string,
        extra: Partial<ContractPowerOfAttorneyErp> = {},
    ): Partial<ContractPowerOfAttorneyErp> => ({
        number,
        contractId,
        holderName: `Holder ${number}`,
        issueDate: day(-30),
        validUntil: day(30),
        ...extra,
    });
    await dataSource
        .getRepository(ContractPowerOfAttorneyErp)
        .save([
            row('1', 'ct-a', { scanId: 'scan-1' }),
            row('2', 'ct-a', { validUntil: day(-1) }),
            row('3', 'ct-b'),
            row('4', 'ct-gone', { isDeleted: true }),
            row('5', 'ct-unknown'),
        ]);
});

const numbers = async (
    list: Parameters<PowerOfAttorneyListService['findVisible']>[1],
): Promise<string[]> => (await service.findVisible(ctx, list)).items.map(i => i.number).sort();

describe('power of attorney list (real Postgres)', () => {
    it('resolves contract and counterparty names, status and the scan indicator', async () => {
        const page = await service.findVisible(ctx, {});
        expect(page.totalItems).toBe(4);
        const byNumber = new Map(page.items.map(i => [i.number, i]));
        expect(byNumber.get('1')).toMatchObject({
            contractName: 'Contract A',
            counterpartyName: 'Customer A',
            status: 'active',
            hasScan: true,
            scanId: 'scan-1',
            contractDeleted: false,
        });
        expect(byNumber.get('2')).toMatchObject({ status: 'expired', hasScan: false });
        expect(byNumber.get('5')).toMatchObject({ contractName: null, counterpartyName: null });
        expect(byNumber.has('4')).toBe(false);
    });

    it('shows rows of a deleted contract, marked, only with the dedicated permission', async () => {
        expect(await numbers({})).toEqual(['1', '2', '3', '5']);
        seesDeleted = true;
        expect(await numbers({})).toEqual(['1', '2', '3', '4', '5']);
        const deleted = (
            await service.findVisible(ctx, { filter: { contractDeleted: { eq: true } } })
        ).items;
        expect(deleted.map(i => [i.number, i.contractDeleted])).toEqual([['4', true]]);
    });

    it('limits rows to the contracts of visible counterparties, never unresolved ones', async () => {
        visibleIds = ['1'];
        expect(await numbers({})).toEqual(['1', '2']);
        seesDeleted = true;
        expect(await numbers({})).toEqual(['1', '2', '4']);
        visibleIds = [];
        expect(await numbers({})).toEqual([]);
        expect(await service.countForCounterparty(ctx, '1')).toBe(0);
    });

    it('applies search, filters, sort, pagination and count-only on top of the scope', async () => {
        visibleIds = ['1'];
        expect(await numbers({ search: 'holder 2' })).toEqual(['2']);
        expect(await numbers({ search: 'customer b' })).toEqual([]);
        expect(await numbers({ filter: { status: { eq: 'expired' } } })).toEqual(['2']);
        expect(await numbers({ filter: { hasScan: { eq: true } } })).toEqual(['1']);
        const sorted = await service.findVisible(ctx, {
            take: 1,
            skip: 1,
            sort: { number: 'ASC' },
        });
        expect(sorted.items.map(i => i.number)).toEqual(['2']);
        expect(await service.findVisible(ctx, { take: 0 })).toEqual({ items: [], totalItems: 2 });
        expect(await numbers({ search: "x' OR '1'='1" })).toEqual([]);
    });

    it('counts a counterparty rows with the same scope', async () => {
        expect(await service.countForCounterparty(ctx, '1')).toBe(2);
        expect(await service.countForCounterparty(ctx, '2')).toBe(1);
    });
});
