import { describe, expect, it } from 'vitest';
import { BLANK_CUSTOMERS_FILTERS } from '../../api/customersList';
import { withUrlSearch } from '../../composables/customersListUrl';

describe('withUrlSearch', () => {
    it('applies a new search from the URL and keeps the other filters', () => {
        const current = { ...BLANK_CUSTOMERS_FILTERS, view: 'active' };
        expect(withUrlSearch(current, 'alpha')).toEqual({ ...current, search: 'alpha' });
    });

    it('returns null when the URL already matches, so the URL sync cannot loop', () => {
        const current = { ...BLANK_CUSTOMERS_FILTERS, search: 'alpha' };
        expect(withUrlSearch(current, 'alpha')).toBeNull();
    });

    it('clears the search when the param disappears from the URL', () => {
        const current = { ...BLANK_CUSTOMERS_FILTERS, search: 'alpha' };
        expect(withUrlSearch(current, undefined)).toEqual({ ...current, search: '' });
    });
});
