import { beforeAll, describe, expect, it } from 'vitest';

import { admin, customerToken, shop, staffToken } from '../harness/actors';
import {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryProductSlug,
    categorySlug,
} from '../seed/category-plan';
import { CUSTOMERS, STAFF } from '../seed/fixture-plan';

const PLANNED = CATEGORY_PLAN.map(c => ({ erpId: c.erpId, visible: c.visible }));
const HIDDEN = PLANNED.filter(c => !c.visible).map(c => c.erpId);
const VISIBLE = PLANNED.filter(c => c.visible).map(c => c.erpId);
const slugOf = categoryProductSlug;

const PRODUCT_BY_SLUG = `query($s: String!) { product(slug: $s) { id slug } }`;
const PRODUCT_BY_ID = `query($id: ID!) { product(id: $id) { id slug } }`;
const PRODUCTS = `{ products(options: { take: 100 }) { totalItems items { id slug } } }`;
const BROWSE = `{ search(input: { groupByProduct: true, take: 100 }) { totalItems items { slug productId } } }`;
const BY_HIDDEN_COLLECTION = `query($s: String!) { search(input: { collectionSlug: $s, groupByProduct: true }) { totalItems items { slug } } }`;
const ADMIN_PRODUCT = `query($s: String!) { products(options: { filter: { slug: { eq: $s } } }) { items { id slug variants { id } } } }`;
const ADD = `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename ... on ErrorResult { message } } }`;

const shopActors: { name: string; token: () => Promise<string> }[] = [
    { name: 'guest', token: async () => '' },
    ...CUSTOMERS.map(c => ({ name: c.key, token: () => customerToken(c.key) })),
];

async function adminProduct(erpId: string): Promise<{ id: string; variantId: string }> {
    const result = await admin<{
        products: { items: { id: string; variants: { id: string }[] }[] };
    }>(await staffToken('superadmin'), ADMIN_PRODUCT, { s: slugOf(erpId) });
    const item = result.data!.products.items[0];
    return { id: item.id, variantId: item.variants[0].id };
}

describe.each(shopActors)('products of hidden categories for $name', ({ token: open }) => {
    let token: string;
    beforeAll(async () => {
        token = await open();
    });

    it.each(HIDDEN)(
        'product(slug) of hidden category %s answers like a missing product',
        async erpId => {
            const result = await shop<{ product: unknown }>(token, PRODUCT_BY_SLUG, {
                s: slugOf(erpId),
            });
            expect(result.errors).toEqual([]);
            expect(result.data!.product).toBeNull();
        },
    );

    it.each(HIDDEN)(
        'product(id) of hidden category %s answers like a missing product',
        async erpId => {
            const { id } = await adminProduct(erpId);
            const result = await shop<{ product: unknown }>(token, PRODUCT_BY_ID, { id });
            expect(result.errors).toEqual([]);
            expect(result.data!.product).toBeNull();
        },
    );

    it.each(VISIBLE)('product of visible category %s stays reachable', async erpId => {
        const result = await shop<{ product: { slug: string } | null }>(token, PRODUCT_BY_SLUG, {
            s: slugOf(erpId),
        });
        expect(result.data!.product?.slug).toBe(slugOf(erpId));
    });

    it('products lists the visible ones and none of the hidden ones', async () => {
        const result = await shop<{ products: { items: { slug: string }[] } }>(token, PRODUCTS);
        expect(result.errors).toEqual([]);
        const slugs = result.data!.products.items.map(p => p.slug);
        for (const erpId of HIDDEN) expect(slugs, erpId).not.toContain(slugOf(erpId));
        for (const erpId of VISIBLE) expect(slugs, erpId).toContain(slugOf(erpId));
    });

    it('the catalog listing (search without a term) drops hidden-category products', async () => {
        const result = await shop<{ search: { items: { slug: string }[] } }>(token, BROWSE);
        expect(result.errors).toEqual([]);
        const slugs = result.data!.search.items.map(i => i.slug);
        for (const erpId of HIDDEN) expect(slugs, erpId).not.toContain(slugOf(erpId));
        for (const erpId of VISIBLE) expect(slugs, erpId).toContain(slugOf(erpId));
    });

    it.each([...HIDDEN, PLACEHOLDER_CATEGORY])(
        'searching the hidden category %s directly lists nothing',
        async erpId => {
            const result = await shop<{ search: { totalItems: number; items: unknown[] } }>(
                token,
                BY_HIDDEN_COLLECTION,
                { s: categorySlug(erpId) },
            );
            expect(result.errors).toEqual([]);
            expect(result.data!.search.totalItems).toBe(0);
            expect(result.data!.search.items).toEqual([]);
        },
    );
});

describe.each(CUSTOMERS.map(c => c.key))('cart and hidden categories for %s', key => {
    it.each(HIDDEN)('cannot add the variant of hidden category %s', async erpId => {
        const token = await customerToken(key);
        const { variantId } = await adminProduct(erpId);
        const result = await shop<{ addItemToOrder: { __typename: string } }>(token, ADD, {
            id: variantId,
        });
        expect(result.data!.addItemToOrder.__typename).toBe('OrderInterceptorError');
    });
});

describe.each(STAFF.map(s => s.key))('staff %s keeps the catalog of hidden categories', key => {
    it.each(HIDDEN)('reads the product of hidden category %s in the admin API', async erpId => {
        const token = await staffToken(key);
        const result = await admin<{ products: { items: { slug: string }[] } }>(
            token,
            ADMIN_PRODUCT,
            {
                s: slugOf(erpId),
            },
        );
        expect(result.errors).toEqual([]);
        expect(result.data!.products.items.map(p => p.slug)).toEqual([slugOf(erpId)]);
    });
});
