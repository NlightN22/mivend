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

    it('tells own feed from a hidden ancestor', () => {
        const info = describeCategoryVisibility([
            col('2', [], true),
            col('3', ['2'], true),
            col('4', [], false, 'visible'),
            col('5', [], false),
        ]);
        expect(info.get('2')?.hiddenReason).toBe('feed');
        expect(info.get('3')?.hiddenReason).toBe('ancestor');
        expect(info.get('4')?.hiddenReason).toBe('');
        expect(info.get('5')?.hiddenReason).toBe('');
    });

    it('names the override only while it hides; a visible override or cleared state shows nothing', () => {
        const info = describeCategoryVisibility([
            col('2', [], true, 'hidden'),
            col('3', ['2'], true, 'visible'),
            col('4', ['2'], false, 'visible'),
            col('5', ['2'], true, 'hidden'),
        ]);
        expect(info.get('2')?.hiddenReason).toBe('manual');
        expect(info.get('3')?.hiddenReason).toBe('ancestor');
        expect(info.get('4')?.hiddenReason).toBe('');
        expect(info.get('5')?.hiddenReason).toBe('manual');
    });

    it('reports a hidden empty leaf under a hidden override parent as a hidden ancestor', () => {
        const info = describeCategoryVisibility([
            col('2', [], true, 'hidden'),
            col('3', ['2'], true),
        ]);
        expect(info.get('3')?.hiddenReason).toBe('ancestor');
    });

    it('flags rows with a hidden ancestor so the page can withhold the visible override', () => {
        const info = describeCategoryVisibility([
            col('2', [], true),
            col('3', ['2'], true, 'visible'),
            col('4', ['2', '3'], true),
            col('5', [], false),
        ]);
        expect(info.get('2')?.hiddenByAncestor).toBe(false);
        expect(info.get('3')?.hiddenByAncestor).toBe(true);
        expect(info.get('4')?.hiddenByAncestor).toBe(true);
        expect(info.get('5')?.hiddenByAncestor).toBe(false);
    });
});
