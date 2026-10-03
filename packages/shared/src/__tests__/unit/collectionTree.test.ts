import { describe, it, expect } from 'vitest';
import {
    buildCategoryPanel,
    buildCategoryTree,
    fetchAllCollections,
    filterVisibleCrumbs,
    findCategoryPath,
    type RawCollection,
} from '../../collectionTree';

const root = { id: '1', name: '__root__', slug: '__root_collection__' };
const col = (id: string, ancestors: string[], icon?: string): RawCollection => {
    const crumbs = ancestors.map(a => ({ id: a, name: `n${a}`, slug: `s${a}` }));
    return {
        id,
        name: `n${id}`,
        slug: `s${id}`,
        breadcrumbs: [root, ...crumbs, { id, name: `n${id}`, slug: `s${id}` }],
        featuredAsset: icon ? { preview: icon } : null,
    };
};

describe('buildCategoryTree', () => {
    it('nests collections at any depth regardless of input order', () => {
        const tree = buildCategoryTree([
            col('4', ['2', '3']),
            col('2', []),
            col('3', ['2']),
            col('5', []),
        ]);
        expect(tree.map(n => n.id)).toEqual(['2', '5']);
        expect(tree[0].children[0].children[0].id).toBe('4');
    });

    it('maps the featured asset preview to iconUrl, null when absent', () => {
        const tree = buildCategoryTree([col('2', [], '/a.png'), col('3', [])]);
        expect(tree.map(n => n.iconUrl)).toEqual(['/a.png', null]);
    });

    it('attaches a node to its nearest visible ancestor when a middle ancestor is missing', () => {
        const tree = buildCategoryTree([col('2', []), col('4', ['2', '3'])]);
        expect(tree[0].children.map(n => n.id)).toEqual(['4']);
    });

    it('promotes a node to top level when every ancestor is missing', () => {
        const tree = buildCategoryTree([col('4', ['2', '3'])]);
        expect(tree.map(n => n.id)).toEqual(['4']);
    });
});

describe('findCategoryPath / buildCategoryPanel', () => {
    const tree = buildCategoryTree([
        col('2', []),
        col('3', ['2']),
        col('4', ['2']),
        col('5', ['2', '3']),
        col('6', []),
    ]);

    it('returns the visible path or empty for an unknown slug', () => {
        expect(findCategoryPath(tree, 's5').map(n => n.id)).toEqual(['2', '3', '5']);
        expect(findCategoryPath(tree, 'nope')).toEqual([]);
    });

    it('lists top-level categories as the level when nothing is selected', () => {
        const panel = buildCategoryPanel(tree);
        expect(panel.current).toBeUndefined();
        expect(panel.ancestors).toEqual([]);
        expect(panel.level.map(c => c.id)).toEqual(['2', '6']);
        expect(panel.levelIsChildren).toBe(false);
    });

    it('shows only children (not siblings) when current has children', () => {
        const panel = buildCategoryPanel(tree, 's3');
        expect(panel.current?.id).toBe('3');
        expect(panel.ancestors.map(c => c.id)).toEqual(['2']);
        expect(panel.level.map(c => c.id)).toEqual(['5']);
        expect(panel.levelIsChildren).toBe(true);
    });

    it('shows siblings including current for a leaf', () => {
        const panel = buildCategoryPanel(tree, 's4');
        expect(panel.ancestors.map(c => c.id)).toEqual(['2']);
        expect(panel.level.map(c => c.id)).toEqual(['3', '4']);
        expect(panel.levelIsChildren).toBe(false);
    });

    it('keeps only the 2 nearest ancestors, outermost first', () => {
        const deep = buildCategoryTree([
            col('2', []),
            col('3', ['2']),
            col('4', ['2', '3']),
            col('5', ['2', '3', '4']),
        ]);
        expect(buildCategoryPanel(deep, 's5').ancestors.map(c => c.id)).toEqual(['3', '4']);
    });

    it('uses top-level categories as the level for a top-level leaf', () => {
        const panel = buildCategoryPanel(tree, 's6');
        expect(panel.ancestors).toEqual([]);
        expect(panel.level.map(c => c.id)).toEqual(['2', '6']);
    });

    it('falls back to the top-level list for an unknown slug', () => {
        expect(buildCategoryPanel(tree, 'nope').level.map(c => c.id)).toEqual(['2', '6']);
    });
});

describe('fetchAllCollections', () => {
    it('pages until totalItems is reached', async () => {
        const data = Array.from({ length: 250 }, (_, i) => i);
        const calls: number[] = [];
        const all = await fetchAllCollections(async (skip, take) => {
            calls.push(skip);
            return { items: data.slice(skip, skip + take), totalItems: data.length };
        });
        expect(all).toHaveLength(250);
        expect(calls).toEqual([0, 100, 200]);
    });

    it('stops on an empty page even if totalItems overstates', async () => {
        const all = await fetchAllCollections(async skip => ({
            items: skip === 0 ? [1] : [],
            totalItems: 5,
        }));
        expect(all).toEqual([1]);
    });
});

describe('filterVisibleCrumbs', () => {
    it('drops the root and ancestors that are absent from the tree', () => {
        const tree = buildCategoryTree([col('2', []), col('4', ['2', '3'])]);
        const crumbs = col('4', ['2', '3']).breadcrumbs;
        expect(filterVisibleCrumbs(crumbs, tree).map(c => c.id)).toEqual(['2', '4']);
    });
});
