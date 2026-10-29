import { adminGql, postBatch, waitForRun } from '../../helpers/api';
import { pollUntil } from '../../helpers/category-tree';
import { VIS_PRICE_TYPES } from './plan';
import {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryRootOf,
    categoryName,
    categoryProductSlug,
    categorySku,
    categorySlug,
} from '../../../../apps/server/src/__tests__/access/seed/category-plan';

export {
    CATEGORY_PLAN,
    PLACEHOLDER_CATEGORY,
    categoryName,
    categoryProductSlug,
    categorySku,
    categorySlug,
};

const LIST = `{ collections(options: { take: 100 }) { items { id slug isPrivate customFields { visibilityOverride } } } }`;
const SET = `mutation($id: ID!, $o: String, $p: Boolean) { updateCollection(input: { id: $id, isPrivate: $p, customFields: { visibilityOverride: $o } }) { id } }`;

interface Row {
    id: string;
    slug: string;
    isPrivate: boolean;
    customFields: { visibilityOverride: string | null } | null;
}

const listAll = async (token: string): Promise<Row[]> =>
    (await adminGql<{ collections: { items: Row[] } }>(LIST, undefined, token)).data.collections
        .items;

async function apply(name: string, type: string, rows: Record<string, unknown>[]): Promise<void> {
    const exchangeId = `e2e-vis-cat-${name}-${Date.now()}`;
    await postBatch(
        exchangeId,
        rows.map(data => ({ type, data })),
    );
    const run = await waitForRun(exchangeId);
    if (run.errors.length > 0)
        throw new Error(`erp-import ${name} failed: ${JSON.stringify(run.errors)}`);
}

// Resets every planned override and waits until the planned visibility is what the API reports.
export async function restoreCategoryPlan(token: string): Promise<void> {
    const rows = await listAll(token);
    for (const plan of CATEGORY_PLAN) {
        const row = rows.find(r => r.slug === categorySlug(plan.erpId));
        if (!row) throw new Error(`Category ${plan.erpId} is missing`);
        const current = row.customFields?.visibilityOverride ?? null;
        const wanted = plan.override ?? null;
        if (current === wanted) continue;
        await adminGql(
            SET,
            { id: row.id, o: wanted, ...(wanted === null ? {} : { p: wanted === 'hidden' }) },
            token,
        );
    }
    const expected = new Map(CATEGORY_PLAN.map(c => [categorySlug(c.erpId), !c.visible]));
    expected.set(categorySlug(PLACEHOLDER_CATEGORY), true);
    await pollUntil(async () => {
        const actual = new Map((await listAll(token)).map(r => [r.slug, r.isPrivate]));
        return [...expected].every(([slug, hidden]) => actual.get(slug) === hidden);
    }, 30_000);
}

export async function seedCategoryTree(superadmin: string, organizationId: number): Promise<void> {
    await apply(
        'categories',
        'category',
        CATEGORY_PLAN.map(c => ({
            erpId: c.erpId,
            name: categoryName(c.erpId),
            parentErpId: c.parent,
            isActive: c.isActive,
            isDeleted: c.isDeleted,
        })),
    );
    await apply(
        'products',
        'product',
        CATEGORY_PLAN.map(c => ({
            externalId: `ext-${categorySku(c.erpId)}`,
            sku: categorySku(c.erpId),
            name: `Product of ${c.erpId}`,
            slug: categoryProductSlug(c.erpId),
            price: 100,
            stockOnHand: 10,
            categoryCode: c.erpId,
            organizationId,
        })),
    );
    await apply(
        'prices',
        'price',
        CATEGORY_PLAN.flatMap(c =>
            [VIS_PRICE_TYPES.a, VIS_PRICE_TYPES.b].map(priceTypeCode => ({
                productExternalId: `ext-${categorySku(c.erpId)}`,
                priceTypeCode,
                price: 100,
            })),
        ),
    );
    await apply(
        'stock',
        'stock',
        CATEGORY_PLAN.map(c => ({ sku: categorySku(c.erpId), stockOnHand: 10 })),
    );
    await restoreCategoryPlan(superadmin);
    await waitForRootContents(superadmin);
}

// Collection contents are filled by the worker's apply-collection-filters job.
async function waitForRootContents(token: string): Promise<void> {
    const inTree = CATEGORY_PLAN.filter(c => categoryRootOf(c.erpId) === 'vis-root').length;
    await pollUntil(async () => {
        const { data } = await adminGql<{
            collection: { productVariants: { totalItems: number } } | null;
        }>(
            `query($s: String!) { collection(slug: $s) { productVariants { totalItems } } }`,
            { s: categorySlug('vis-root') },
            token,
        );
        return data.collection?.productVariants.totalItems === inTree;
    }, 60_000);
}
