import { describe, expect, it, vi } from 'vitest';
import type { SearchInput } from '@vendure/common/lib/generated-types';
import type { RequestContext } from '@vendure/core';

import { ExternalSearchService } from '../../external-search.service';
import { InternalShopSearchResolver } from '../../internal-shop-search.resolver';
import { mapSearchQuery } from '../../code-match-query';
import { categorySlug, planCategoryVisibilityUpdates } from 'shared';

const ctx = {
    languageCode: 'en',
    channel: { defaultCurrencyCode: 'RUB' },
} as unknown as RequestContext;
const HIDDEN_FACET_VALUE = '41';

interface Backend {
    name: string;
    restrictsCustomer(): Promise<boolean>;
    restrictsStaff(): Promise<boolean>;
}

// Both backends answer "does a customer search drop hidden-category products, and a staff search keep them".
const internal: Backend = {
    name: 'internal',
    async restrictsCustomer() {
        const search = vi.fn().mockResolvedValue({ items: [], totalItems: 0 });
        const resolver = new InternalShopSearchResolver(
            { get: () => ({ search }) } as never,
            { hiddenFacetValueIds: async () => [HIDDEN_FACET_VALUE] } as never,
            { expand: async (_ctx: unknown, input: unknown) => input } as never,
        );
        const { input } = await resolver.search(ctx, { term: 'oil' });
        const query = mapSearchQuery(
            { bool: { filter: [] } },
            input as { hiddenFacetValueIds: string[] },
            true,
        );
        return JSON.stringify(query).includes(`"facetValueIds":["${HIDDEN_FACET_VALUE}"]`);
    },
    async restrictsStaff() {
        const query = mapSearchQuery({ bool: { filter: [] } }, { term: 'oil' }, false);
        return JSON.stringify(query).includes('facetValueIds');
    },
};

function externalService(
    hiddenCategory: boolean,
    hiddenErpIds: string[] = ['h1'],
): {
    service: ExternalSearchService;
    client: { resolveQuery: ReturnType<typeof vi.fn> };
} {
    const client = { resolveQuery: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const filters = {
        resolve: async () => ({
            categoryId: 'c1',
            manufacturer: [],
            characteristics: [],
            unsatisfiable: false,
        }),
    };
    const service = new ExternalSearchService(
        client as never,
        { findByExternalIds: async () => new Map() } as never,
        filters as never,
        {} as never,
        { resolveExternalId: async () => null } as never,
        {
            isCategoryHidden: async () => hiddenCategory,
            hiddenCategoryErpIds: async () => hiddenErpIds,
        } as never,
    );
    return { service, client };
}

const external: Backend = {
    name: 'external',
    async restrictsCustomer() {
        const { service, client } = externalService(true);
        await service.search(ctx, { term: 'oil' } as SearchInput);
        return client.resolveQuery.mock.calls.length === 0;
    },
    async restrictsStaff() {
        const { service, client } = externalService(true);
        await service.search(ctx, { term: 'oil' } as SearchInput, true);
        return client.resolveQuery.mock.calls.length === 0;
    },
};

describe.each([internal, external])('hidden categories on the $name backend', backend => {
    it('restricts the customer search', async () => {
        expect(await backend.restrictsCustomer()).toBe(true);
    });

    it('leaves the staff search unrestricted', async () => {
        expect(await backend.restrictsStaff()).toBe(false);
    });
});

describe('hidden categories reach each backend as the same hidden set', () => {
    it('external sends excludeCategoryIds for a customer and none for staff (mocked client)', async () => {
        const shop = externalService(false);
        await shop.service.search(ctx, { term: 'oil' } as SearchInput);
        expect(shop.client.resolveQuery.mock.calls[0][0].excludeCategoryIds).toEqual(['h1']);
        const staff = externalService(false);
        await staff.service.search(ctx, { term: 'oil' } as SearchInput, true);
        expect(staff.client.resolveQuery.mock.calls[0][0]).not.toHaveProperty('excludeCategoryIds');
    });
});

describe('a visible override under a hidden ancestor stays hidden on both backends', () => {
    const node = (id: string, parentId: string | null, over: string | null) => ({
        id,
        parentId,
        slug: categorySlug(id),
        feedHidden: id === 'root',
        visibilityOverride: over,
        isPrivate: false,
    });
    const hiddenIds = planCategoryVisibilityUpdates([
        node('root', null, null),
        node('child', 'root', 'visible'),
        node('grandchild', 'child', null),
    ])
        .filter(u => u.isPrivate)
        .map(u => u.id)
        .sort();

    it('plans the whole subtree as hidden', () => {
        expect(hiddenIds).toEqual(['child', 'grandchild', 'root']);
    });

    it('internal filters every hidden category facet value', async () => {
        const search = vi.fn().mockResolvedValue({ items: [], totalItems: 0 });
        const resolver = new InternalShopSearchResolver(
            { get: () => ({ search }) } as never,
            { hiddenFacetValueIds: async () => hiddenIds.map(id => `fv-${id}`) } as never,
            { expand: async (_ctx: unknown, input: unknown) => input } as never,
        );
        const { input } = await resolver.search(ctx, { term: 'oil' });
        const query = JSON.stringify(
            mapSearchQuery(
                { bool: { filter: [] } },
                input as { hiddenFacetValueIds: string[] },
                true,
            ),
        );
        for (const id of hiddenIds) expect(query).toContain(`fv-${id}`);
    });

    it('external excludes every hidden category id', async () => {
        const { service, client } = externalService(false, hiddenIds);
        await service.search(ctx, { term: 'oil' } as SearchInput);
        expect(client.resolveQuery.mock.calls[0][0].excludeCategoryIds).toEqual(hiddenIds);
    });
});
