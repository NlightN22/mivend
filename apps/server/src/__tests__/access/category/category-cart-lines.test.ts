import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, customerToken, shop, staffToken } from '../harness/actors';
import { categoryProductSlug, categorySlug } from '../seed/category-plan';
import { CUSTOMERS } from '../seed/fixture-plan';

const ADMIN_PRODUCT = `query($s: String!) { products(options: { filter: { slug: { eq: $s } } }) { items { variants { id } } } }`;
const COLLECTION_ID = `query($s: String!) { collections(options: { filter: { slug: { eq: $s } } }) { items { id } } }`;
const SET_STATE = `mutation($id: ID!, $hidden: Boolean!, $o: String) { updateCollection(input: { id: $id, isPrivate: $hidden, customFields: { visibilityOverride: $o } }) { id } }`;
const ADD = `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename ... on Order { lines { id quantity } } } }`;
const ADJUST = `mutation($l: ID!, $q: Int!) { adjustOrderLine(orderLineId: $l, quantity: $q) { __typename ... on ErrorResult { message } ... on Order { lines { quantity } } } }`;
const REMOVE = `mutation($l: ID!) { removeOrderLine(orderLineId: $l) { __typename } }`;
const TRANSITION = `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on OrderStateTransitionError { transitionError } } }`;
const BACK = `mutation { transitionOrderToState(state: "AddingItems") { __typename } }`;
const PICKUP = `{ eligibleShippingMethods { id code } }`;
const SHIP = `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`;

const CATEGORY = 'vis-a1';
const customer = CUSTOMERS[0].key;

describe('a cart line whose category is hidden afterwards', () => {
    let token: string;
    let superadmin: string;
    let collectionId: string;
    let lineId: string;

    const setHidden = async (hidden: boolean): Promise<void> => {
        const result = await admin(superadmin, SET_STATE, {
            id: collectionId,
            hidden,
            o: hidden ? 'hidden' : null,
        });
        expect(result.errors).toEqual([]);
    };

    beforeAll(async () => {
        token = await customerToken(customer);
        superadmin = await staffToken('superadmin');
        const slug = categoryProductSlug(CATEGORY);
        const product = await admin<{ products: { items: { variants: { id: string }[] }[] } }>(
            superadmin,
            ADMIN_PRODUCT,
            { s: slug },
        );
        const collections = await admin<{ collections: { items: { id: string }[] } }>(
            superadmin,
            COLLECTION_ID,
            { s: categorySlug(CATEGORY) },
        );
        collectionId = collections.data!.collections.items[0].id;
        const added = await shop<{ addItemToOrder: { lines: { id: string }[] } }>(token, ADD, {
            id: product.data!.products.items[0].variants[0].id,
        });
        lineId = added.data!.addItemToOrder.lines[0].id;
        await shop(token, ADJUST, { l: lineId, q: 2 });
        const methods = await shop<{ eligibleShippingMethods: { id: string; code: string }[] }>(
            token,
            PICKUP,
        );
        const pickup = methods.data!.eligibleShippingMethods.find(m => m.code === 'pickup')!;
        await shop(token, SHIP, { id: [pickup.id] });
        await setHidden(true);
    });

    afterAll(async () => {
        await setHidden(false);
        await shop(token, BACK);
        await shop(token, REMOVE, { l: lineId });
    });

    it('cannot be raised and cannot go to checkout', async () => {
        const raised = await shop<{ adjustOrderLine: { __typename: string } }>(token, ADJUST, {
            l: lineId,
            q: 3,
        });
        expect(raised.data!.adjustOrderLine.__typename).toBe('OrderInterceptorError');
        const placed = await shop<{ transitionOrderToState: { __typename: string } }>(
            token,
            TRANSITION,
        );
        expect(placed.data!.transitionOrderToState.__typename).toBe('OrderStateTransitionError');
    });

    it('can be lowered by the customer', async () => {
        const lowered = await shop<{ adjustOrderLine: { __typename: string } }>(token, ADJUST, {
            l: lineId,
            q: 1,
        });
        expect(lowered.data!.adjustOrderLine.__typename).toBe('Order');
    });

    it('works again after the category is un-hidden', async () => {
        await setHidden(false);
        const raised = await shop<{ adjustOrderLine: { __typename: string } }>(token, ADJUST, {
            l: lineId,
            q: 2,
        });
        expect(raised.data!.adjustOrderLine.__typename).toBe('Order');
        const placed = await shop<{ transitionOrderToState: { __typename: string } }>(
            token,
            TRANSITION,
        );
        expect(placed.data!.transitionOrderToState.__typename).toBe('Order');
    });

    it('can still be removed while hidden', async () => {
        await shop(token, BACK);
        await setHidden(true);
        const removed = await shop<{ removeOrderLine: { __typename: string } }>(token, REMOVE, {
            l: lineId,
        });
        expect(removed.data!.removeOrderLine.__typename).toBe('Order');
    });
});
