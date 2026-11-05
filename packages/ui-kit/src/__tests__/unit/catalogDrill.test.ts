import { describe, expect, it } from 'vitest';
import { resolveDrill } from '../../components/MvCatalogDropdown/catalogDrill';
import type { CollectionNode } from '../../components/MvCatalogDropdown/MvCatalogDropdownGroup.vue';

const node = (id: string, children: CollectionNode[] = []): CollectionNode => ({
    id,
    name: id,
    slug: id,
    children,
});
const tree = [node('a', [node('a1', [node('a1x')]), node('a2')]), node('b')];

describe('resolveDrill', () => {
    it('empty path lists the top level', () => {
        const level = resolveDrill(tree, []);
        expect(level.trail).toEqual([]);
        expect(level.items.map(c => c.id)).toEqual(['a', 'b']);
    });

    it('drills generically to any depth', () => {
        const level = resolveDrill(tree, ['a', 'a1']);
        expect(level.trail.map(c => c.id)).toEqual(['a', 'a1']);
        expect(level.items.map(c => c.id)).toEqual(['a1x']);
    });

    it('truncates at an id that no longer exists', () => {
        const level = resolveDrill(tree, ['a', 'gone', 'a1']);
        expect(level.trail.map(c => c.id)).toEqual(['a']);
        expect(level.items.map(c => c.id)).toEqual(['a1', 'a2']);
    });
});
