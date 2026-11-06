import { test, expect } from '@playwright/test';
import { shopGql, shopLoginCookie } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import {
    acting,
    actingToken,
    ADD,
    variantIdsBySku,
    counterpartyIdOfCustomerEmail,
} from '../../helpers/acting';
import { SUPERADMIN } from '../../fixtures/accounts';
import {
    boostStock,
    CREDIT_BUYER,
    OVER_LIMIT_CART,
    PASSWORD,
} from '../../storefront/checkout-credit/helpers';

let superadmin: string;
let variants: Record<string, string>;
const actingTokens: string[] = [];

test.beforeAll(async () => {
    superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    variants = await variantIdsBySku(
        superadmin,
        OVER_LIMIT_CART.map(([sku]) => sku),
    );
    await boostStock(OVER_LIMIT_CART.map(([sku]) => sku));
});

test.afterAll(async () => {
    for (const t of actingTokens) {
        await acting(t, `mutation { finishActingSession }`).catch(() => undefined);
    }
});

test.describe('acting session credit check @on:manager-operator', () => {
    test('the credit limit check gives an acting cart the same verdict as the customer own cart', async () => {
        const buyer = await shopLoginCookie(CREDIT_BUYER, PASSWORD);
        const buyerCounterparty = await counterpartyIdOfCustomerEmail(superadmin, CREDIT_BUYER);
        const preview = `query { deferredCreditPreview { exceeded limitControlled orderAmount } }`;
        type Preview = {
            deferredCreditPreview: {
                exceeded: boolean;
                limitControlled: boolean;
                orderAmount: number;
            };
        };
        const token = await actingToken(superadmin, buyerCounterparty);
        actingTokens.push(token);
        for (const [sku, qty] of OVER_LIMIT_CART) {
            await acting(token, ADD, { v: variants[sku], q: qty });
            await shopGql(ADD, { v: variants[sku], q: qty }, buyer);
        }
        const own = await shopGql<Preview>(preview, undefined, buyer);
        const viaActing = await acting<Preview>(token, preview);
        expect(own.deferredCreditPreview.exceeded).toBe(true);
        expect(viaActing.deferredCreditPreview).toEqual(own.deferredCreditPreview);

        const prices = `query { activeOrder { lines { productVariant { sku } linePriceWithTax } } }`;
        type Priced = {
            activeOrder: { lines: { productVariant: { sku: string }; linePriceWithTax: number }[] };
        };
        const linePrices = (c: Priced): [string, number][] =>
            c.activeOrder.lines
                .map(l => [l.productVariant.sku, l.linePriceWithTax] as [string, number])
                .sort();
        expect(linePrices(await acting<Priced>(token, prices))).toEqual(
            linePrices(await shopGql<Priced>(prices, undefined, buyer)),
        );

        const methods = await acting<{ eligibleShippingMethods: { id: string; code: string }[] }>(
            token,
            `query { eligibleShippingMethods { id code } }`,
        );
        const pickup = methods.eligibleShippingMethods.find(m => m.code === 'pickup');
        await acting(
            token,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [pickup?.id] },
        );
        await acting(
            token,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
        );
        expect((await acting<Preview>(token, preview)).deferredCreditPreview).toEqual(
            own.deferredCreditPreview,
        );
        await shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, buyer);
        await acting(token, `mutation { finishActingSession }`);
    });
});
