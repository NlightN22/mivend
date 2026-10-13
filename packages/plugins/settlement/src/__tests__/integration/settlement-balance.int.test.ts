import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementBalance } from '../../entities/settlement-balance.entity';
import { createHarness, ctx } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementBalanceInput } from '../../types';

let h: Harness;

beforeAll(async () => {
    h = await createHarness('settlement_balance');
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query('TRUNCATE settlement_balance RESTART IDENTITY');
    h.counterparties.clear();
    h.contracts.clear();
});

const balance = (over: Partial<SettlementBalanceInput> = {}): SettlementBalanceInput => ({
    key: 'org-1:cp-1:ct-1',
    version: '2026-10-01T10:00:00Z',
    isDeleted: false,
    organizationErpId: 'org-1',
    counterpartyErpId: 'cp-1',
    contractErpId: 'ct-1',
    currency: 'RUB',
    openingDate: new Date('2026-01-01T00:00:00Z'),
    openingBalance: 100,
    closingBalance: 250.25,
    ...over,
});

const rows = (): Promise<SettlementBalance[]> =>
    h.dataSource.getRepository(SettlementBalance).find();

describe('SettlementBalanceService (real Postgres)', () => {
    it('concurrent delivery of one key yields one row', async () => {
        await Promise.all(Array.from({ length: 6 }, () => h.balances.apply(ctx, balance())));

        const stored = await rows();
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ openingBalance: 10000, closingBalance: 25025 });
    });

    it('versions are monotonic per triple: an older one is dropped, a newer one wins', async () => {
        await h.balances.apply(
            ctx,
            balance({ version: '2026-10-02T10:00:00Z', closingBalance: 5 }),
        );

        expect(await h.balances.apply(ctx, balance({ closingBalance: 999 }))).toBe('stale');
        expect((await rows())[0].closingBalance).toBe(500);

        await h.balances.apply(
            ctx,
            balance({ version: '2026-10-03T10:00:00Z', closingBalance: 7 }),
        );
        expect((await rows())[0].closingBalance).toBe(700);
    });

    it('stores a closing balance that disagrees with opening plus documents without complaint', async () => {
        await h.balances.apply(ctx, balance({ openingBalance: 100, closingBalance: 0 }));

        expect((await rows())[0].closingBalance).toBe(0);
    });

    it('resolves local ids at write time and attaches the pending ones later', async () => {
        await h.balances.apply(ctx, balance());
        expect((await rows())[0]).toMatchObject({ counterpartyId: null, contractId: null });

        await h.pending.attachCounterparty(ctx, 'cp-1', '3');
        await h.pending.attachContract(ctx, 'ct-1', '4');

        expect((await rows())[0]).toMatchObject({ counterpartyId: '3', contractId: '4' });
    });
});
