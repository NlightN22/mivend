import { expect, test } from '@playwright/test';
import { shopGql, shopLoginCookie } from '../helpers/api';
import { select } from './contour-db';
import { envValue, loadContourEnv } from './contour-env';

interface Customer {
    label: string;
    erpId: string;
    login: { email: string; password: string } | null;
}

const ABAKAN_ERP = '8c4f416b-c192-11e1-8a03-f46d0490adee';
const KRASNOYARSK_ERP = 'c9c66220-45a2-11e2-bda5-f46d0490adee';

function customers(): Customer[] {
    const abakan = loadContourEnv().customer;
    const email = envValue('STAGING_TEST_KRASNOYARSK_CUSTOMER_EMAIL');
    const password = envValue('STAGING_TEST_KRASNOYARSK_CUSTOMER_PASSWORD');
    return [
        { label: 'branch-a customer', erpId: ABAKAN_ERP, login: abakan },
        {
            label: 'branch-b customer',
            erpId: KRASNOYARSK_ERP,
            login: email && password ? { email, password } : null,
        },
    ];
}

const pointsOf = (erpId: string): string[] =>
    select<{ id: string }>(
        `SELECT tp.id::text AS id FROM trading_point tp JOIN counterparty c ON c.id = tp."counterpartyId" WHERE c."erpId" = '${erpId}' ORDER BY tp.id`,
    ).map(r => r.id);

for (const customer of customers()) {
    const other = customer.erpId === ABAKAN_ERP ? KRASNOYARSK_ERP : ABAKAN_ERP;
    test.describe(`11: ${customer.label} in the storefront`, () => {
        let cookie: string;

        test.beforeAll(async () => {
            if (customer.login)
                cookie = await shopLoginCookie(customer.login.email, customer.login.password);
        });
        test.beforeEach(() => {
            test.skip(
                !customer.login,
                `the ${customer.label} login is not set in the staging-integration env file`,
            );
        });

        test('sees only its own counterparty and its own trading points', async () => {
            const mine = pointsOf(customer.erpId);
            const foreign = pointsOf(other);
            expect(mine.length, 'the customer has a trading point').toBeGreaterThan(0);
            expect(
                foreign.length,
                'the other counterparty has a trading point to protect',
            ).toBeGreaterThan(0);

            const own = await shopGql<{
                activeCustomer: { counterparty: { erpId: string } | null };
            }>(`query { activeCustomer { counterparty { erpId } } }`, undefined, cookie);
            expect(own.activeCustomer.counterparty?.erpId).toBe(customer.erpId);

            const listed = await shopGql<{ myTradingPoints: { id: string }[] }>(
                `query { myTradingPoints { id } }`,
                undefined,
                cookie,
            );
            const ids = listed.myTradingPoints.map(p => p.id);
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) expect(mine, `point ${id} is its own`).toContain(id);
            for (const id of foreign)
                expect(ids, `foreign point ${id} is not listed`).not.toContain(id);
        });

        test('a trading point of another counterparty is not returned by id', async () => {
            for (const id of pointsOf(other)) {
                const result = await shopGql<{ tradingPoint: { id: string } | null }>(
                    `query($id: ID!) { tradingPoint(id: $id) { id } }`,
                    { id },
                    cookie,
                ).catch(() => ({ tradingPoint: null }));
                expect(result.tradingPoint, `foreign point ${id}`).toBeNull();
            }
        });
    });
}
