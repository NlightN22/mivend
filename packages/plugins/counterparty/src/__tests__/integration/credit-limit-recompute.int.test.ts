import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CreditLimitRecomputeService } from '../../credit-limit-recompute.service';

// Real Postgres, hand-rolled tables holding only the columns the recompute SQL touches.
const { schema, extra } = testSchemaOptions('credit_limit_recompute');
let dataSource: DataSource;
let service: CreditLimitRecomputeService;

const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

interface ContractSeed {
    limit: string | null;
    flagged?: boolean | null;
    active?: boolean;
}

async function addCounterparty(contracts: ContractSeed[], creditLimit = 0): Promise<number> {
    const [cp] = await run(
        `INSERT INTO counterparty ("creditLimit", "updatedAt") VALUES ($1, '2000-01-01') RETURNING id`,
        [creditLimit],
    );
    for (const c of contracts) {
        await run(
            `INSERT INTO contract ("counterpartyId", "creditLimit", "controlledIndividually", "isActive", "updatedAt")
             VALUES ($1, $2, $3, $4, '2000-01-01')`,
            [String(cp.id), c.limit, c.flagged ?? null, c.active ?? true],
        );
    }
    return Number(cp.id);
}

const poolOf = async (id: number): Promise<number> =>
    Number(
        (await run(`SELECT "creditLimit" FROM counterparty WHERE id = $1`, [id]))[0].creditLimit,
    );

const effective = async (id: number): Promise<Array<string | null>> =>
    (
        await run(
            `SELECT "effectiveCreditLimit" AS e FROM contract WHERE "counterpartyId" = $1 ORDER BY id`,
            [String(id)],
        )
    ).map(r => r.e as string | null);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await run(`CREATE TABLE counterparty (
        id serial PRIMARY KEY, "creditLimit" bigint NOT NULL DEFAULT 0, "updatedAt" timestamp DEFAULT now())`);
    await run(`CREATE TABLE contract (
        id serial PRIMARY KEY, "counterpartyId" varchar NOT NULL, "creditLimit" varchar,
        "controlledIndividually" boolean, "isActive" boolean NOT NULL DEFAULT true,
        "effectiveCreditLimit" numeric(18,2), "updatedAt" timestamp DEFAULT now())`);
    service = new CreditLimitRecomputeService({ rawConnection: dataSource } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await run(`TRUNCATE contract, counterparty RESTART IDENTITY`);
});

describe('credit limit recompute (real SQL)', () => {
    it('pools the active non-flagged limits and keeps flagged sublimits inside the pool', async () => {
        const id = await addCounterparty([
            { limit: '100000' },
            { limit: '50000.50', flagged: false },
            { limit: '30000', flagged: true },
        ]);
        await service.recomputeAll();
        expect(await poolOf(id)).toBe(150001);
        expect(await effective(id)).toEqual(['100000.00', '50000.50', '30000.00']);
    });

    it('clamps flagged sublimits proportionally when they exceed the pool', async () => {
        const id = await addCounterparty([
            { limit: '100' },
            { limit: '300', flagged: true },
            { limit: '100', flagged: true },
        ]);
        await service.recomputeAll();
        expect(await poolOf(id)).toBe(100);
        expect(await effective(id)).toEqual(['100.00', '75.00', '25.00']);
    });

    it('ignores inactive contracts and unparsable limits', async () => {
        const id = await addCounterparty([
            { limit: '100' },
            { limit: '900', active: false },
            { limit: 'abc' },
            { limit: null },
        ]);
        await service.recomputeAll();
        expect(await poolOf(id)).toBe(100);
        expect(await effective(id)).toEqual(['100.00', null, null, null]);
    });

    it('means "no deferred payment" (0), never unlimited, without pool contracts', async () => {
        const noContracts = await addCounterparty([], 5000);
        const onlyFlagged = await addCounterparty([{ limit: '700', flagged: true }], 5000);
        const onlyInactive = await addCounterparty([{ limit: '700', active: false }], 5000);
        await service.recomputeAll();
        expect(await poolOf(noContracts)).toBe(0);
        expect(await poolOf(onlyFlagged)).toBe(0);
        expect(await effective(onlyFlagged)).toEqual(['0.00']);
        expect(await poolOf(onlyInactive)).toBe(0);
    });

    it('keeps counterparties isolated from each other', async () => {
        const a = await addCounterparty([{ limit: '100' }, { limit: '500', flagged: true }]);
        const b = await addCounterparty([{ limit: '1000' }, { limit: '500', flagged: true }]);
        await service.recomputeAll();
        expect(await poolOf(a)).toBe(100);
        expect(await effective(a)).toEqual(['100.00', '100.00']);
        expect(await poolOf(b)).toBe(1000);
        expect(await effective(b)).toEqual(['1000.00', '500.00']);
    });

    it('is idempotent: a second run writes nothing, a changed input is picked up', async () => {
        const id = await addCounterparty([{ limit: '100' }]);
        expect(await service.recomputeAll()).toEqual({
            contractsUpdated: 1,
            counterpartiesUpdated: 1,
        });
        expect(await service.recomputeAll()).toEqual({
            contractsUpdated: 0,
            counterpartiesUpdated: 0,
        });
        await run(`UPDATE contract SET "creditLimit" = '250' WHERE "counterpartyId" = $1`, [
            String(id),
        ]);
        expect(await service.recomputeAll()).toEqual({
            contractsUpdated: 1,
            counterpartiesUpdated: 1,
        });
        expect(await poolOf(id)).toBe(250);
    });

    it('drains more changed rows than one batch', async () => {
        for (let i = 0; i < 5; i++) await addCounterparty([{ limit: '10' }]);
        expect(await service.recomputeAll(2)).toEqual({
            contractsUpdated: 5,
            counterpartiesUpdated: 5,
        });
        expect(await service.recomputeAll(2)).toEqual({
            contractsUpdated: 0,
            counterpartiesUpdated: 0,
        });
    });
});
