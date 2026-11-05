import { describe, expect, it } from 'vitest';

import {
    CategoryVisibilityNode,
    categorySlug,
    planCategoryVisibilityUpdates,
} from '../../categoryCollectionFilter';
import {
    HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL,
    excludeCategoryIdsFor,
    productInHiddenCategorySql,
    productNotInHiddenCategorySql,
} from '../../hiddenCategoryProducts';

interface Cat {
    id: string;
    parent: string | null;
    feedHidden?: boolean;
    override?: 'hidden' | 'visible';
}

// A product sits in exactly one category chain, so it is hidden exactly when its category is.
function hiddenCategories(tree: Cat[]): Set<string> {
    const nodes: CategoryVisibilityNode[] = tree.map(c => ({
        id: c.id,
        parentId: c.parent,
        slug: categorySlug(c.id),
        feedHidden: c.feedHidden ?? false,
        visibilityOverride: c.override ?? null,
        isPrivate: false,
    }));
    return new Set(
        planCategoryVisibilityUpdates(nodes)
            .filter(u => u.isPrivate)
            .map(u => u.id),
    );
}

const tree = (patch: Record<string, Partial<Cat>> = {}): Cat[] =>
    [
        { id: 'root', parent: null },
        { id: 'mid', parent: 'root' },
        { id: 'leaf', parent: 'mid' },
        { id: 'other', parent: null },
    ].map(c => ({ ...c, ...patch[c.id] }));

describe('which categories hide their products', () => {
    it('hides nothing when everything is visible', () => {
        expect(hiddenCategories(tree()).size).toBe(0);
    });

    it('hides a directly hidden category and every descendant, not siblings', () => {
        expect([...hiddenCategories(tree({ mid: { override: 'hidden' } }))].sort()).toEqual([
            'leaf',
            'mid',
        ]);
    });

    it('hides a feed-hidden category and its descendants', () => {
        expect([...hiddenCategories(tree({ root: { feedHidden: true } }))].sort()).toEqual([
            'leaf',
            'mid',
            'root',
        ]);
    });

    it('restores the subtree when the override is removed or set to visible', () => {
        const hidden = tree({ root: { override: 'hidden' } });
        expect(hiddenCategories(hidden).has('leaf')).toBe(true);
        expect(hiddenCategories(tree()).has('leaf')).toBe(false);
        const revived = tree({ root: { override: 'hidden' }, mid: { override: 'visible' } });
        expect([...hiddenCategories(revived)].sort()).toEqual(['root']);
    });

    it('a feed-hidden category stays hidden even if the ancestor chain is visible', () => {
        expect([...hiddenCategories(tree({ leaf: { feedHidden: true } }))]).toEqual(['leaf']);
    });
});

describe('hidden category SQL', () => {
    it('selects category facet values whose slug-matched collection is private', () => {
        expect(HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL).toContain(`f.code = 'category'`);
        expect(HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL).toContain(`'cat-' || fv.code`);
        expect(HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL).toContain('"isPrivate" = true');
    });

    it('checks the product link table and the live variants, on the given column', () => {
        const sql = productInHiddenCategorySql('p.id');
        expect(sql).toContain('product_facet_values_facet_value');
        expect(sql).toContain('product_variant_facet_values_facet_value');
        expect(sql).toContain('"deletedAt" IS NULL');
        expect(sql).toContain('= p.id');
        expect(sql).not.toContain('product.id');
    });

    it('negates the same predicate', () => {
        expect(productNotInHiddenCategorySql()).toBe(`NOT ${productInHiddenCategorySql()}`);
    });
});

describe('excludeCategoryIdsFor', () => {
    const row = (id: number, parentId: number | null, erp: string) => ({
        id,
        parentId,
        slug: `cat-${erp}`,
    });

    it('sends every hidden category by ERP id, sorted and deduplicated', () => {
        const rows = [row(2, 1, 'b'), row(1, null, 'a'), row(3, 1, 'b')];
        expect(excludeCategoryIdsFor(rows)).toEqual(['a', 'b']);
    });

    it('ignores collections that are not categories and ids search-service would reject', () => {
        const rows = [
            { id: 9, parentId: null, slug: 'root' },
            row(1, null, ''),
            row(2, null, 'x'.repeat(101)),
            row(3, null, 'ok'),
        ];
        expect(excludeCategoryIdsFor(rows)).toEqual(['ok']);
    });

    it('past the cap sends only hidden nodes whose parent is visible', () => {
        const rows = [
            row(1, null, 'top'),
            row(2, 1, 'mid'),
            row(3, 2, 'leaf'),
            row(4, 99, 'orphan'),
        ];
        expect(excludeCategoryIdsFor(rows, 3)).toEqual(['orphan', 'top']);
    });

    it('returns nothing when no category is hidden', () => {
        expect(excludeCategoryIdsFor([])).toEqual([]);
    });
});
