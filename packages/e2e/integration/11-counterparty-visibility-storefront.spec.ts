import { expect, test } from '@playwright/test';
import { shopLoginCookie } from '../helpers/api';
import { select } from './contour-db';
import { envValue, loadContourEnv } from './contour-env';

const SERVER = (): string => loadContourEnv().serverUrl;

interface Customer {
    label: string;
    login: { email: string; password: string } | null;
}

function customers(): Customer[] {
    const emailB = envValue('STAGING_TEST_CUSTOMER_B_EMAIL');
    const passwordB = envValue('STAGING_TEST_CUSTOMER_B_PASSWORD');
    return [
        { label: 'branch-a customer', login: loadContourEnv().customer },
        {
            label: 'branch-b customer',
            login: emailB && passwordB ? { email: emailB, password: passwordB } : null,
        },
    ];
}

const counterpartyOf = (email: string): string =>
    select<{ id: string }>(
        `SELECT "customFieldsCounterpartyid" AS id FROM customer WHERE "emailAddress" = '${email.replace(/'/g, "''")}'`,
    )[0].id;

const pointsOf = (counterpartyId: string): string[] =>
    select<{ id: string }>(
        `SELECT id::text AS id FROM trading_point WHERE "counterpartyId" = ${counterpartyId} ORDER BY id`,
    ).map(r => r.id);

async function shop<T>(
    query: string,
    variables?: Record<string, unknown>,
    cookie?: string,
): Promise<{ data: T | null; errors: string[] }> {
    const res = await fetch(`${SERVER()}/shop-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T | null; errors?: { message: string }[] };
    return { data: json.data, errors: (json.errors ?? []).map(e => e.message) };
}

const BY_ID = `query($id: ID!) { tradingPoint(id: $id) { id } }`;
type ById = { tradingPoint: { id: string } | null };

const all = customers();
for (const customer of all) {
    const other = all.find(c => c !== customer)!;
    test.describe(`11: ${customer.label} in the storefront`, () => {
        let cookie: string;
        let mine: string[];
        let foreign: string[];

        test.beforeAll(async () => {
            if (!customer.login || !other.login) return;
            cookie = await shopLoginCookie(customer.login.email, customer.login.password);
            mine = pointsOf(counterpartyOf(customer.login.email));
            foreign = pointsOf(counterpartyOf(other.login.email));
        });
        test.beforeEach(() => {
            test.skip(
                !customer.login || !other.login,
                'a customer login is not set in the staging-integration env file',
            );
        });

        test('sees only its own counterparty and its own trading points in the lists', async () => {
            expect(mine.length, 'the customer has a trading point').toBeGreaterThan(0);
            expect(
                foreign.length,
                'the other counterparty has a trading point to protect',
            ).toBeGreaterThan(0);
            const listed = await shop<{ myTradingPoints: { id: string }[] }>(
                `query { myTradingPoints { id } }`,
                undefined,
                cookie,
            );
            expect(listed.errors).toEqual([]);
            const ids = listed.data!.myTradingPoints.map(p => p.id);
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) expect(mine, `point ${id} is its own`).toContain(id);
            for (const id of foreign)
                expect(ids, `foreign point ${id} is not listed`).not.toContain(id);
        });

        test('by id: its own point is returned, a point of another counterparty is not, even to a guest', async () => {
            const own = await shop<ById>(BY_ID, { id: mine[0] }, cookie);
            expect(own.errors).toEqual([]);
            expect(own.data!.tradingPoint?.id, 'the own point is returned').toBe(mine[0]);
            for (const id of foreign) {
                const asCustomer = await shop<ById>(BY_ID, { id }, cookie);
                expect(asCustomer.errors, 'no error that confirms the id exists').toEqual([]);
                expect(
                    asCustomer.data!.tradingPoint,
                    `foreign point ${id} as the customer`,
                ).toBeNull();
                const asGuest = await shop<ById>(BY_ID, { id });
                expect(
                    asGuest.data?.tradingPoint ?? null,
                    `foreign point ${id} as a guest`,
                ).toBeNull();
            }
        });
    });
}
