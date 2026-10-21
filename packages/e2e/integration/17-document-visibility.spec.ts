import { expect, test } from '@playwright/test';
import { shopLoginCookie } from '../helpers/api';
import { adminCall, superadminToken } from './price-type-access';
import { ACTORS, actorCredentials, actorState, actorToken, expectedIds } from './branch-actors';
import { envValue, loadContourEnv } from './contour-env';
import {
    balanceContracts,
    customerCounterparty,
    documentCount,
    downloadStatus,
    sampleDocuments,
    settlementEntryIds,
    settlementSample,
    shop,
    type SampleDocument,
} from './document-scope';

const LIST = `query($cp: ID, $order: ID, $search: String) { documents(counterpartyId: $cp, orderId: $order,
    options: { take: 1, search: $search }) { totalItems items { id } } }`;
const TYPES = `query($cp: ID) { documentTypes(counterpartyId: $cp) }`;
const ASSET = `query($id: ID!) { asset(id: $id) { id } }`;

type List = { totalItems: number; items: { id: string }[] };

let superadmin: string;
let samples: SampleDocument[];

test.beforeAll(async () => {
    superadmin = await superadminToken();
    samples = sampleDocuments();
    expect(samples.length, 'a counterparty with a generated PDF document').toBeGreaterThan(0);
});

async function documents(token: string, vars: Record<string, unknown> = {}): Promise<List> {
    const result = await adminCall(token, LIST, vars);
    expect(result.errors).toEqual([]);
    return (result.data as { documents: List }).documents;
}

test.describe('17: documents in the manager portal API', () => {
    test('the superadmin sees every sample document and its PDF', async () => {
        for (const s of samples) {
            const list = await documents(superadmin, { cp: s.counterpartyId });
            expect(list.totalItems).toBe(documentCount([s.counterpartyId]));
            expect(
                (await documents(superadmin, { search: s.number })).items.map(i => i.id),
            ).toContain(s.id);
            expect(await downloadStatus(s.source, { token: superadmin })).toBe(200);
        }
    });

    for (const actor of ACTORS) {
        test(`${actor.key} (${actor.role}, ${actor.scope}): list, search, order, types, asset`, async () => {
            test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
            const visible = expectedIds(actor, actorState(actor));
            const token = await actorToken(actor.key);

            const all = await documents(token);
            const total =
                actor.scope === 'all'
                    ? documentCount(samples.map(s => s.counterpartyId))
                    : documentCount([...visible]);
            if (actor.scope === 'all') expect(all.totalItems).toBeGreaterThanOrEqual(total);
            else expect(all.totalItems).toBe(total);

            for (const s of samples) {
                const shown = visible.has(s.counterpartyId);
                const own = await documents(token, { cp: s.counterpartyId });
                expect(own.totalItems, `documents of ${s.counterpartyId}`).toBe(
                    shown ? documentCount([s.counterpartyId]) : 0,
                );
                const found = await documents(token, { search: s.number });
                expect(
                    found.items.some(i => i.id === s.id),
                    'search by number',
                ).toBe(shown);
                if (s.orderId) {
                    const byOrder = await documents(token, { order: s.orderId });
                    expect(byOrder.totalItems > 0, 'documents of the order').toBe(shown);
                }
                const types = await adminCall(token, TYPES, { cp: s.counterpartyId });
                expect(types.errors).toEqual([]);
                expect(
                    (types.data as { documentTypes: string[] }).documentTypes.length > 0,
                    'types',
                ).toBe(shown);

                // The file record carries the PDF link, so a hidden document's asset must not resolve either.
                const asset = await adminCall(token, ASSET, { id: s.assetId });
                const resolved =
                    (asset.data as { asset: { id: string } | null } | null)?.asset ?? null;
                if (!shown) expect(resolved, `asset of hidden ${s.counterpartyId}`).toBeNull();
            }
        });
    }
});

interface Customer {
    label: string;
    login: { email: string; password: string } | null;
}

function customers(): Customer[] {
    const email = envValue('STAGING_TEST_CUSTOMER_B_EMAIL');
    const password = envValue('STAGING_TEST_CUSTOMER_B_PASSWORD');
    return [
        { label: 'branch-a customer', login: loadContourEnv().customer },
        { label: 'branch-b customer', login: email && password ? { email, password } : null },
    ];
}

const MY_DOCS = `query($search: String) { myDocuments(options: { take: 200, search: $search }) { totalItems items { id } } }`;
const SETTLEMENT = `query($f: SettlementDocumentFilter) { settlementDocuments(filter: $f, take: 100) { totalItems items { id } } }`;
const BALANCES = `query($c: String) { settlementBalances(contractId: $c) { contractId } }`;
type MyDocs = { myDocuments: List };
type Settlement = { settlementDocuments: List };
type Balances = { settlementBalances: { contractId: string | null }[] };

const all = customers();
for (const customer of all) {
    const other = all.find(c => c !== customer)!;
    test.describe(`17: ${customer.label} documents in the storefront`, () => {
        let cookie: string;
        let mine: string;
        let foreign: string;

        test.beforeAll(async () => {
            if (!customer.login || !other.login) return;
            cookie = await shopLoginCookie(customer.login.email, customer.login.password);
            mine = customerCounterparty(customer.login.email);
            foreign = customerCounterparty(other.login.email);
        });
        test.beforeEach(() => {
            test.skip(
                !customer.login || !other.login,
                'a customer login is not set in the staging-integration env file',
            );
        });

        test('sees only its own documents and cannot find the other one by number', async () => {
            const own = await shop<MyDocs>(MY_DOCS, {}, cookie);
            expect(own.errors).toEqual([]);
            expect(own.data!.myDocuments.totalItems).toBe(documentCount([mine]));
            for (const s of samples.filter(d => d.counterpartyId !== mine)) {
                const found = await shop<MyDocs>(MY_DOCS, { search: s.number }, cookie);
                expect(found.data!.myDocuments.items.map(i => i.id)).not.toContain(s.id);
            }
        });

        test('cannot download a PDF of another counterparty', async () => {
            const foreignPdfs = samples.filter(d => d.counterpartyId !== mine);
            test.skip(foreignPdfs.length === 0, 'no PDF of another counterparty on the contour');
            for (const s of foreignPdfs)
                expect(await downloadStatus(s.source, { cookie }), s.id).not.toBe(200);
        });

        test('sees only its own settlement documents, sales invoices and balances', async () => {
            const own = settlementEntryIds(mine);
            expect(own.length, 'the customer has settlement documents').toBeGreaterThan(0);
            const list = await shop<Settlement>(SETTLEMENT, {}, cookie);
            expect(list.errors).toEqual([]);
            expect(list.data!.settlementDocuments.totalItems).toBe(own.length);
            expect(list.data!.settlementDocuments.items.map(i => i.id).sort()).toEqual(
                [...own].sort(),
            );

            const sales = await shop<Settlement>(SETTLEMENT, { f: { category: 'sale' } }, cookie);
            expect(sales.data!.settlementDocuments.items.every(i => own.includes(i.id))).toBe(true);

            const theirs = settlementSample(foreign);
            expect(theirs, 'the other counterparty has a settlement document').toBeTruthy();
            const byNumber = await shop<Settlement>(
                SETTLEMENT,
                { f: { search: theirs!.number } },
                cookie,
            );
            expect(byNumber.data!.settlementDocuments.items.map(i => i.id)).not.toContain(
                theirs!.entryId,
            );
            const byContract = await shop<Settlement>(
                SETTLEMENT,
                { f: { contractId: theirs!.contractId } },
                cookie,
            );
            expect(byContract.data!.settlementDocuments.totalItems, 'the other contract').toBe(0);

            const balances = await shop<Balances>(BALANCES, {}, cookie);
            expect(balances.errors).toEqual([]);
            const contracts = balances.data!.settlementBalances.map(b => b.contractId);
            expect(contracts.sort()).toEqual(balanceContracts(mine).sort());
            for (const c of balanceContracts(foreign)) {
                const probe = await shop<Balances>(BALANCES, { c }, cookie);
                expect(probe.data!.settlementBalances, 'balance of the other contract').toEqual([]);
            }
        });
    });
}

test.describe('17: a guest', () => {
    test('gets no documents, settlement documents, balances or PDFs', async () => {
        const docs = await shop<MyDocs>(MY_DOCS);
        expect(docs.data?.myDocuments?.items ?? []).toEqual([]);
        const settlement = await shop<Settlement>(SETTLEMENT);
        expect(settlement.data?.settlementDocuments?.items ?? []).toEqual([]);
        const balances = await shop<Balances>(BALANCES);
        expect(balances.data?.settlementBalances ?? []).toEqual([]);
        for (const s of samples)
            expect(await downloadStatus(s.source), `PDF ${s.id}`).not.toBe(200);
    });
});
