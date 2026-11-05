import { describe, expect, it } from 'vitest';
import { buildCategoryTreeRows, parentIdsWithChildren } from '../../utils/categoryVisibilityTree';

function c(id: string, name: string, path: string[] = []) {
    return { id, name, breadcrumbs: [{ id: 'root' }, ...path.map(p => ({ id: p })), { id }] };
}

const items = [
    c('b', 'Beta'),
    c('a', 'Alpha'),
    c('a1', 'Screws', ['a']),
    c('a1x', 'Steel screws', ['a', 'a1']),
    c('orphan', 'Orphan', ['missing']),
];

const summary = (rows: ReturnType<typeof buildCategoryTreeRows<(typeof items)[number]>>) =>
    rows.map(r => `${r.depth}:${r.item.id}${r.expanded ? '+' : ''}`);

describe('buildCategoryTreeRows', () => {
    it('shows only roots when nothing is expanded, children after their parent when expanded', () => {
        expect(summary(buildCategoryTreeRows(items, new Set(), ''))).toEqual([
            '0:b',
            '0:a',
            '0:orphan',
        ]);
        expect(summary(buildCategoryTreeRows(items, new Set(['a', 'a1']), ''))).toEqual([
            '0:b',
            '0:a+',
            '1:a1+',
            '2:a1x',
            '0:orphan',
        ]);
    });

    it('reveals ancestors of a match and hides unrelated rows', () => {
        const rows = buildCategoryTreeRows(items, new Set(), 'steel');
        expect(summary(rows)).toEqual(['0:a+', '1:a1+', '2:a1x']);
        expect(rows[0].hasChildren).toBe(true);
    });

    it('treats a category with an unloaded ancestor as a root', () => {
        expect(summary(buildCategoryTreeRows(items, new Set(), 'orphan'))).toEqual(['0:orphan']);
    });
});

describe('parentIdsWithChildren', () => {
    it('lists only categories that have loaded children', () => {
        expect(parentIdsWithChildren(items).sort()).toEqual(['a', 'a1']);
    });
});
