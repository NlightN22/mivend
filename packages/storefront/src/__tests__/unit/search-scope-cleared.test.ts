import { describe, expect, it } from 'vitest';

import { clearedSearchLocation } from '../../composables/searchScope';

describe('clearedSearchLocation', () => {
    it('drops the term from the URL when the field is emptied, keeping the category', () => {
        expect(clearedSearchLocation('', '5w30', 'oils')).toEqual({
            path: '/catalog',
            query: { collection: 'oils' },
        });
    });

    it('does nothing while the field still has text', () => {
        expect(clearedSearchLocation('5w', '5w30', undefined)).toBeNull();
    });

    it('does nothing when the URL has no term (nothing stale to clear)', () => {
        expect(clearedSearchLocation('', undefined, 'oils')).toBeNull();
    });
});
