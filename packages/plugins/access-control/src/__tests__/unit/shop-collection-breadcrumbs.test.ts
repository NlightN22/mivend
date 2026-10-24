import { describe, expect, it } from 'vitest';

import { dropPrivateAncestors } from '../../shop-collection-breadcrumbs';

const crumbs = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

describe('dropPrivateAncestors', () => {
    it('keeps everything when no ancestor is private', () => {
        expect(dropPrivateAncestors(crumbs, new Set())).toEqual(crumbs);
    });

    it('drops private middle ancestors only', () => {
        expect(dropPrivateAncestors(crumbs, new Set(['2']))).toEqual([
            { id: '1' },
            { id: '3' },
            { id: '4' },
        ]);
    });

    it('never drops the root or the collection itself', () => {
        expect(dropPrivateAncestors(crumbs, new Set(['1', '4']))).toEqual(crumbs);
    });

    it('handles numeric ids and short lists', () => {
        expect(dropPrivateAncestors([{ id: 1 }, { id: 2 }, { id: 3 }], new Set(['2']))).toEqual([
            { id: 1 },
            { id: 3 },
        ]);
        expect(dropPrivateAncestors([{ id: 1 }], new Set(['1']))).toEqual([{ id: 1 }]);
    });
});
