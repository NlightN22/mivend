import { describe, expect, it } from 'vitest';

import { customerToken, shop } from '../harness/actors';
import { CUSTOMERS, SETTLEMENT_NUMBERS, type CustomerKey } from '../seed/fixture-plan';

const SETTLEMENT = `query($f: SettlementDocumentFilter) { settlementDocuments(filter: $f, take: 100) {
    totalItems items { id number category contractId } } }`;
const BALANCES = `query($c: String) { settlementBalances(contractId: $c) { contractId } }`;
type Row = { id: string; number: string; category: string; contractId: string | null };
type Settlement = { settlementDocuments: { totalItems: number; items: Row[] } };
type Balances = { settlementBalances: { contractId: string | null }[] };

const numbersOf = (key: CustomerKey): string[] => Object.values(SETTLEMENT_NUMBERS[key]).sort();

async function rows(
    token: string,
    f: Record<string, unknown> = {},
): Promise<Settlement['settlementDocuments']> {
    const result = await shop<Settlement>(token, SETTLEMENT, { f });
    expect(result.errors).toEqual([]);
    return result.data!.settlementDocuments;
}

async function balanceContracts(token: string, c?: string): Promise<(string | null)[]> {
    const result = await shop<Balances>(token, BALANCES, c === undefined ? {} : { c });
    expect(result.errors).toEqual([]);
    return result.data!.settlementBalances.map(b => b.contractId);
}

describe.each(CUSTOMERS.map(c => c.key))('settlement data of %s', (key: CustomerKey) => {
    const foreign = CUSTOMERS.find(c => c.key !== key)!.key;

    it('sees only its own settlement documents, sales invoices and balances', async () => {
        const [token, other] = [await customerToken(key), await customerToken(foreign)];
        const own = await rows(token);
        expect(own.items.map(i => i.number).sort()).toEqual(numbersOf(key));
        expect(own.totalItems).toBe(numbersOf(key).length);

        const sales = await rows(token, { category: 'sale' });
        expect(sales.items.map(i => i.number)).toEqual([SETTLEMENT_NUMBERS[key].sale]);

        const theirs = (await rows(other)).items;
        expect(theirs.length, 'the other customer has settlement documents').toBeGreaterThan(0);
        for (const t of theirs) {
            const found = await rows(token, { search: t.number });
            expect(
                found.items.map(i => i.id),
                `search ${t.number}`,
            ).not.toContain(t.id);
            expect((await rows(token, { contractId: t.contractId })).totalItems).toBe(0);
        }

        const mine = await balanceContracts(token);
        expect(mine.length, 'own balance').toBe(1);
        expect(mine).toEqual([own.items[0].contractId]);
        const theirBalances = await balanceContracts(other);
        expect(theirBalances.length).toBe(1);
        for (const c of theirBalances)
            expect(await balanceContracts(token, c!), 'the other contract').toEqual([]);
    });
});

it('a guest gets no settlement documents and no balances', async () => {
    const settlement = await shop<Settlement>('', SETTLEMENT, {});
    expect(settlement.data?.settlementDocuments?.items ?? []).toEqual([]);
    const balances = await shop<Balances>('', BALANCES, {});
    expect(balances.data?.settlementBalances ?? []).toEqual([]);
});
