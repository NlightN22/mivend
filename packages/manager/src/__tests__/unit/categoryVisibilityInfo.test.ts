import { describe, it, expect } from 'vitest';
import {
    describeCategoryVisibility,
    type CategoryVisibilityCollection,
} from '../../api/categoryVisibility';

const root = { id: '1', name: 'root' };
const col = (
    id: string,
    ancestors: string[],
    isPrivate: boolean,
    override: string | null = null,
): CategoryVisibilityCollection => ({
    id,
    name: `n${id}`,
    slug: `cat-${id}`,
    isPrivate,
    breadcrumbs: [root, ...ancestors.map(a => ({ id: a, name: `n${a}` })), { id, name: `n${id}` }],
    customFields: { visibilityOverride: override },
});

describe('describeCategoryVisibility', () => {
    it('reports depth and parent name, top level has no parent', () => {
        const info = describeCategoryVisibility([col('2', [], false), col('3', ['2'], false)]);
        expect(info.get('2')).toMatchObject({ depth: 1, parentName: '' });
        expect(info.get('3')).toMatchObject({ depth: 2, parentName: 'n2' });
    });

    it('tells own feed from a hidden ancestor and a manual override', () => {
        const info = describeCategoryVisibility([
            col('2', [], true),
            col('3', ['2'], true),
            col('4', [], false, 'visible'),
            col('5', [], false),
        ]);
        expect(info.get('2')?.hiddenReason).toBe('Own feed');
        expect(info.get('3')?.hiddenReason).toBe('Hidden ancestor');
        expect(info.get('4')?.hiddenReason).toBe('Manual override');
        expect(info.get('5')?.hiddenReason).toBe('');
    });
});
