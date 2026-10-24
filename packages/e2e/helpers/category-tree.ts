import { adminTokenFor } from './api-tokens';
import { adminGql, shopGql } from './api';

const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

export const SLUG = {
    engine: 'cat-cat-engine',
    oils: 'cat-cat-engine-oils',
    mineral: 'cat-cat-engine-oils-mineral',
    synthetic: 'cat-cat-engine-oils-synthetic',
    filters: 'cat-cat-engine-filters',
} as const;

interface AdminCollection {
    id: string;
    slug: string;
    isPrivate: boolean;
    customFields: { visibilityOverride: string | null } | null;
}

export async function adminToken(): Promise<string> {
    return adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
}

export async function adminCollections(token: string): Promise<AdminCollection[]> {
    const { data } = await adminGql<{ collections: { items: AdminCollection[] } }>(
        `query { collections(options: { take: 100 }) { items { id slug isPrivate customFields { visibilityOverride } } } }`,
        undefined,
        token,
    );
    return data.collections.items.filter(c => c.slug.startsWith('cat-'));
}

// The seeded visibility subtree keeps its planned overrides; fixtures/visibility/categories.ts restores it.
export async function adminFixtureCollections(token: string): Promise<AdminCollection[]> {
    return (await adminCollections(token)).filter(c => !c.slug.startsWith('cat-vis-'));
}

// Same mutation shape as the manager visibility page (isPrivate omitted when clearing).
export async function setOverride(
    token: string,
    slug: string,
    value: 'hidden' | 'visible' | null,
): Promise<void> {
    const target = (await adminCollections(token)).find(c => c.slug === slug);
    if (!target) throw new Error(`Collection ${slug} not found`);
    await adminGql(
        `mutation($id: ID!, $o: String, $p: Boolean) { updateCollection(input: { id: $id, isPrivate: $p, customFields: { visibilityOverride: $o } }) { id } }`,
        {
            id: target.id,
            o: value,
            ...(value === null ? {} : { p: value === 'hidden' }),
        },
        token,
    );
}

export async function shopSlugs(): Promise<string[]> {
    const data = await shopGql<{ collections: { items: { slug: string }[] } }>(
        `query { collections(options: { take: 100 }) { items { slug } } }`,
    );
    return data.collections.items.map(c => c.slug);
}

export async function pollUntil(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Condition not met within timeout');
}

export async function waitForShopSlug(slug: string, present: boolean): Promise<void> {
    await pollUntil(async () => (await shopSlugs()).includes(slug) === present);
}

export async function restoreCategoryTree(token: string): Promise<void> {
    for (const c of await adminFixtureCollections(token)) {
        if (c.customFields?.visibilityOverride) await setOverride(token, c.slug, null);
    }
    await pollUntil(
        async () => (await adminFixtureCollections(token)).every(c => !c.isPrivate),
        30_000,
    );
}
