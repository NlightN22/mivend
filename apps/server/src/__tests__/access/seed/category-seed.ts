import { gqlOk } from '../harness/graphql';
import { postBatch, type ImportTarget } from './erp-import-seed';
import {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryName,
    categoryRootOf,
    categoryProductSlug,
    categorySku,
    categorySlug,
} from './category-plan';

const LIST = `{ collections(options: { take: 100 }) { items { id slug isPrivate } } }`;

async function waitForVisibility(baseUrl: string, superadmin: string): Promise<void> {
    const expected = new Map(CATEGORY_PLAN.map(c => [categorySlug(c.erpId), !c.visible]));
    expected.set(categorySlug(PLACEHOLDER_CATEGORY), true);
    const deadline = Date.now() + 30_000;
    for (;;) {
        const result = await gqlOk<{
            collections: { items: { slug: string; isPrivate: boolean }[] };
        }>(baseUrl, 'admin-api', LIST, undefined, superadmin);
        const actual = new Map(result.collections.items.map(c => [c.slug, c.isPrivate]));
        const wrong = [...expected].filter(([slug, isPrivate]) => actual.get(slug) !== isPrivate);
        if (wrong.length === 0) return;
        if (Date.now() > deadline)
            throw new Error(`Category visibility did not settle: ${JSON.stringify(wrong)}`);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

const ROOT_SKUS = `query($s: String!) { collection(slug: $s) { productVariants(options: { take: 100 }) { items { sku } } } }`;

// Collection contents are filled by the worker's apply-collection-filters job.
async function waitForRootContents(baseUrl: string, superadmin: string): Promise<void> {
    const expected = CATEGORY_PLAN.filter(c => categoryRootOf(c.erpId) === 'vis-root').length;
    const deadline = Date.now() + 60_000;
    for (;;) {
        const result = await gqlOk<{ collection: { productVariants: { items: unknown[] } } }>(
            baseUrl,
            'admin-api',
            ROOT_SKUS,
            { s: categorySlug('vis-root') },
            superadmin,
        );
        if (result.collection.productVariants.items.length === expected) return;
        if (Date.now() > deadline) throw new Error('Collection contents did not settle');
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

export async function seedCategories(target: ImportTarget, superadmin: string): Promise<void> {
    const call = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        gqlOk<T>(target.baseUrl, 'admin-api', query, variables, superadmin);
    const orgs = await call<{ organizationRequisites: { id: string; erpId: string }[] }>(
        `{ organizationRequisites { id erpId } }`,
    );
    const org = orgs.organizationRequisites.find(o => o.erpId === 'access-org');
    if (!org) throw new Error('Organization access-org is missing');
    await postBatch(
        target,
        'category',
        CATEGORY_PLAN.map(c => ({
            erpId: c.erpId,
            name: categoryName(c.erpId),
            parentErpId: c.parent,
            isActive: c.isActive,
            isDeleted: c.isDeleted,
        })),
        'categories',
    );
    await postBatch(
        target,
        'product',
        CATEGORY_PLAN.map(c => ({
            externalId: `ext-${categorySku(c.erpId)}`,
            sku: categorySku(c.erpId),
            name: `Product of ${c.erpId}`,
            slug: categoryProductSlug(c.erpId),
            price: 100,
            stockOnHand: 10,
            categoryCode: c.erpId,
            organizationId: Number(org.id),
        })),
        'category-products',
    );
    const all = await call<{ collections: { items: { id: string; slug: string }[] } }>(LIST);
    for (const plan of CATEGORY_PLAN.filter(c => c.override)) {
        const target = all.collections.items.find(c => c.slug === categorySlug(plan.erpId));
        if (!target) throw new Error(`Collection ${plan.erpId} is missing`);
        await call(
            `mutation($id: ID!, $o: String, $p: Boolean) { updateCollection(input: { id: $id, isPrivate: $p, customFields: { visibilityOverride: $o } }) { id } }`,
            { id: target.id, o: plan.override, p: plan.override === 'hidden' },
        );
    }
    await waitForVisibility(target.baseUrl, superadmin);
    await waitForRootContents(target.baseUrl, superadmin);
}
