import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, shop, staffToken } from '../harness/actors';
import {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryRootOf,
    categoryProductSlug,
    categorySlug,
} from '../seed/category-plan';
import { CUSTOMERS, STAFF } from '../seed/fixture-plan';

const VISIBLE = CATEGORY_PLAN.filter(c => c.visible).map(c => categorySlug(c.erpId));
const HIDDEN = [
    ...CATEGORY_PLAN.filter(c => !c.visible).map(c => categorySlug(c.erpId)),
    categorySlug(PLACEHOLDER_CATEGORY),
];

const SHOP_LIST = `{ collections(options: { take: 100 }) { items { slug parent { slug } breadcrumbs { slug } } } }`;
const SHOP_ONE = `query($s: String!) { collection(slug: $s) { slug productVariants(options: { take: 100 }) { totalItems items { sku } } } }`;
const SHOP_PRODUCT = `query($s: String!) { product(slug: $s) { slug collections { slug } } }`;
const SHOP_PRODUCTS = `{ products(options: { take: 100 }) { items { slug collections { slug } } } }`;
const ADMIN_LIST = `{ collections(options: { take: 100 }) { items { id slug isPrivate customFields { visibilityOverride } } } }`;
const SET_OVERRIDE = `mutation($id: ID!) { updateCollection(input: { id: $id, isPrivate: false, customFields: { visibilityOverride: "visible" } }) { id } }`;

const shopActors: { name: string; token: () => Promise<string> }[] = [
    { name: 'guest', token: async () => '' },
    ...CUSTOMERS.map(c => ({ name: c.key, token: () => customerToken(c.key) })),
];

async function shopSlugs(token: string): Promise<string[]> {
    const result = await shop<{ collections: { items: { slug: string }[] } }>(token, SHOP_LIST);
    expect(result.errors).toEqual([]);
    return result.data!.collections.items.map(c => c.slug);
}

describe('superadmin proof: the seeded tree exists and carries the planned state', () => {
    it('every planned category and the placeholder exists with the planned isPrivate', async () => {
        const result = await admin<{
            collections: { items: { slug: string; isPrivate: boolean }[] };
        }>(await staffToken('superadmin'), ADMIN_LIST);
        const actual = new Map(result.data!.collections.items.map(c => [c.slug, c.isPrivate]));
        for (const slug of VISIBLE) expect(actual.get(slug), slug).toBe(false);
        for (const slug of HIDDEN) expect(actual.get(slug), slug).toBe(true);
    });
});

describe.each(shopActors)('storefront categories for $name', ({ token: open }) => {
    let token: string;
    beforeAll(async () => {
        token = await open();
    });

    it('the visible tree is complete and no hidden category or subtree member is listed', async () => {
        const slugs = await shopSlugs(token);
        for (const slug of VISIBLE) expect(slugs, slug).toContain(slug);
        for (const slug of HIDDEN) expect(slugs, slug).not.toContain(slug);
    });

    it('no hidden category appears in the breadcrumbs or parent of a visible one', async () => {
        const result = await shop<{
            collections: { items: { slug: string; breadcrumbs: { slug: string }[] }[] };
        }>(token, SHOP_LIST);
        expect(result.errors).toEqual([]);
        for (const c of result.data!.collections.items)
            for (const crumb of c.breadcrumbs)
                expect(HIDDEN, `${c.slug} -> ${crumb.slug}`).not.toContain(crumb.slug);
    });

    it('a visible override keeps its child reachable under a hidden parent', async () => {
        const slugs = await shopSlugs(token);
        expect(slugs).toContain(categorySlug('vis-b2'));
        expect(slugs).toContain(categorySlug('vis-b2x'));
    });

    it.each(HIDDEN)('direct slug %s resolves to nothing', async slug => {
        const result = await shop<{ collection: unknown }>(token, SHOP_ONE, { s: slug });
        expect(result.errors).toEqual([]);
        expect(result.data!.collection).toBeNull();
    });

    it('the root lists its whole subtree and nothing from trees without a visible root', async () => {
        const result = await shop<{
            collection: { productVariants: { items: { sku: string }[] } };
        }>(token, SHOP_ONE, { s: categorySlug('vis-root') });
        const skus = result.data!.collection.productVariants.items.map(v => v.sku);
        for (const plan of CATEGORY_PLAN) {
            const inTree = categoryRootOf(plan.erpId) === 'vis-root';
            expect(skus.includes(`VIS-SKU-${plan.erpId}`), plan.erpId).toBe(inTree);
        }
    });

    it('products never expose a hidden category through their collections', async () => {
        const list = await shop<{
            products: { items: { slug: string; collections: { slug: string }[] }[] };
        }>(token, SHOP_PRODUCTS);
        for (const product of list.data!.products.items)
            for (const c of product.collections)
                expect(HIDDEN, `${product.slug} -> ${c.slug}`).not.toContain(c.slug);
        for (const plan of CATEGORY_PLAN) {
            const one = await shop<{ product: { collections: { slug: string }[] } | null }>(
                token,
                SHOP_PRODUCT,
                { s: categoryProductSlug(plan.erpId) },
            );
            expect(one.errors).toEqual([]);
            for (const c of one.data!.product?.collections ?? [])
                expect(HIDDEN, `${plan.erpId} -> ${c.slug}`).not.toContain(c.slug);
        }
    });
});

describe.each(STAFF.map(s => s.key))('manager portal categories for %s', key => {
    let token: string;
    beforeAll(async () => {
        token = await staffToken(key);
    });

    it('sees every category, hidden ones marked private, and can open each by id', async () => {
        const result = await admin<{
            collections: { items: { id: string; slug: string; isPrivate: boolean }[] };
        }>(token, ADMIN_LIST);
        expect(result.errors).toEqual([]);
        const actual = new Map(result.data!.collections.items.map(c => [c.slug, c]));
        for (const slug of VISIBLE) expect(actual.get(slug)?.isPrivate, slug).toBe(false);
        for (const slug of HIDDEN) {
            const row = actual.get(slug);
            expect(row?.isPrivate, slug).toBe(true);
            const one = await admin<{ collection: { slug: string } | null }>(
                token,
                `query($id: ID!) { collection(id: $id) { slug } }`,
                { id: row!.id },
            );
            expect(one.data!.collection?.slug, slug).toBe(slug);
        }
    });

    it('cannot change a visibility override without the catalog permission', async () => {
        const superadmin = await staffToken('superadmin');
        const list = await admin<{
            collections: {
                items: {
                    id: string;
                    slug: string;
                    customFields: { visibilityOverride: string | null };
                }[];
            };
        }>(superadmin, ADMIN_LIST);
        const target = list.data!.collections.items.find(c => c.slug === categorySlug('vis-b1'))!;
        const denied = await admin(token, SET_OVERRIDE, { id: target.id });
        expect(denied.errors.join(' ')).toMatch(DENIED);
        const after = await admin<{
            collections: {
                items: {
                    slug: string;
                    isPrivate: boolean;
                    customFields: { visibilityOverride: string | null };
                }[];
            };
        }>(superadmin, ADMIN_LIST);
        const row = after.data!.collections.items.find(c => c.slug === target.slug)!;
        expect(row.isPrivate).toBe(true);
        expect(row.customFields.visibilityOverride).toBeNull();
    });
});

const SHOP_FACETS = `{ product(slug: "%s") { facetValues { code name facet { code } } variants { facetValues { code name facet { code } } } } }`;

describe.each(shopActors)('raw facet values for $name', ({ token: open }) => {
    it.each(CATEGORY_PLAN.filter(c => !c.visible).map(c => c.erpId))(
        'product of hidden category %s names no hidden category',
        async erpId => {
            const token = await open();
            const result = await shop<{
                product: {
                    facetValues: { code: string; facet: { code: string } }[];
                    variants: { facetValues: { code: string; facet: { code: string } }[] }[];
                } | null;
            }>(token, SHOP_FACETS.replace('%s', categoryProductSlug(erpId)));
            expect(result.errors).toEqual([]);
            const all = [
                ...(result.data!.product?.facetValues ?? []),
                ...(result.data!.product?.variants.flatMap(v => v.facetValues) ?? []),
            ];
            for (const fv of all.filter(f => f.facet.code === 'category'))
                expect(HIDDEN, fv.code).not.toContain(categorySlug(fv.code));
        },
    );
});
