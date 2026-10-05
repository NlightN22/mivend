import { ref } from 'vue';
import { describe, expect, it } from 'vitest';

import { useCategoryPanel } from '../../composables/useCategoryPanel';
import type { CollectionNode } from '../../../../shared/src/collectionTree';

const node = (slug: string, children: CollectionNode[] = []): CollectionNode => ({
    id: slug,
    name: slug,
    slug,
    children,
});
const tree = [node('a', [node('a1')]), node('b')];

describe('useCategoryPanel', () => {
    it('shows the full tree without a search term', () => {
        const panel = useCategoryPanel(ref(tree), ref(undefined), ref(''), ref(new Map()));
        expect(panel.value.level.map(c => c.slug)).toEqual(['a', 'b']);
    });

    it('shows only matching categories with counts for a search term', () => {
        const counts = ref(
            new Map([
                ['a', 4],
                ['a1', 4],
            ]),
        );
        const panel = useCategoryPanel(ref(tree), ref(undefined), ref('oil'), counts);
        expect(panel.value.level.map(c => [c.slug, c.count])).toEqual([['a', 4]]);
    });

    it('keeps the selected category and its siblings from the returned buckets', () => {
        const counts = ref(
            new Map([
                ['a', 4],
                ['a1', 3],
                ['b', 1],
            ]),
        );
        const panel = useCategoryPanel(ref(tree), ref('a'), ref('oil'), counts);
        expect(panel.value.level.map(c => [c.slug, c.count])).toEqual([['a1', 3]]);
        expect(panel.value.current?.slug).toBe('a');
    });
});
