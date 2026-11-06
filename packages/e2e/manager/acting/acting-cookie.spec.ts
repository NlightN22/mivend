import { test, expect } from '@playwright/test';
import { shopGql, shopLoginCookie } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import {
    acting,
    actingHeaders,
    ADD,
    CART,
    skus,
    type Cart,
    variantIdsBySku,
    counterpartyIdByErpId,
    exchangeTicket,
    rawShop,
    startTicket,
} from '../../helpers/acting';
import { MANAGER_ACCOUNTS, SUPERADMIN } from '../../fixtures/accounts';
import { E2E_COUNTERPARTY_ID, E2E_CUSTOMER } from '../../fixtures/seed';

let operator: string;
let counterpartyId: string;
let variants: Record<string, string>;
let cookie: string;
const actingTokens: string[] = [];

const clearRealCart = () =>
    shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, cookie);

test.beforeAll(async () => {
    operator = await adminTokenFor(
        MANAGER_ACCOUNTS.operator.username,
        MANAGER_ACCOUNTS.operator.password,
    );
    const superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    counterpartyId = await counterpartyIdByErpId(superadmin, E2E_COUNTERPARTY_ID);
    variants = await variantIdsBySku(superadmin, ['E2E-OIL-001', 'E2E-OIL-002']);
    cookie = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await clearRealCart();
});

test.afterAll(async () => {
    for (const t of actingTokens) {
        await rawShop(`mutation { finishActingSession }`, undefined, actingHeaders(t));
    }
    await clearRealCart();
});

test.describe('acting session cookies @on:manager-operator', () => {
    test('a customer cookie in the same request is ignored under the acting header, and no cookie is set', async () => {
        await shopGql(ADD, { v: variants['E2E-OIL-002'], q: 1 }, cookie);
        const ticket = await startTicket(operator, counterpartyId);
        const exchanged = await exchangeTicket(ticket);
        expect(exchanged.setCookie).toEqual([]);
        const token = exchanged.data?.exchangeActingTicket.token as string;
        actingTokens.push(token);
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 1 });

        const mixed = await rawShop<Cart>(CART, undefined, {
            ...actingHeaders(token),
            Cookie: cookie,
        });
        expect(mixed.setCookie).toEqual([]);
        expect(skus(mixed.data as Cart)).toEqual(['E2E-OIL-001']);
        await clearRealCart();
    });

    test('a dead acting token with the customer cookie sets no cookie and leaves the cookie working', async () => {
        await shopGql(ADD, { v: variants['E2E-OIL-002'], q: 1 }, cookie);
        const ticket = await startTicket(operator, counterpartyId);
        const token = (await exchangeTicket(ticket)).data?.exchangeActingTicket.token as string;
        await acting(token, `mutation { finishActingSession }`);

        for (const query of [CART, `query { mySessions { id } }`]) {
            const res = await rawShop(query, undefined, {
                ...actingHeaders(token),
                Cookie: cookie,
            });
            expect(res.setCookie).toEqual([]);
        }
        expect(skus(await shopGql<Cart>(CART, undefined, cookie))).toEqual(['E2E-OIL-002']);
        await clearRealCart();
    });
});
