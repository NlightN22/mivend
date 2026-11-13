import { describe, expect, it } from 'vitest';
import { BLANK_CUSTOMERS_FILTERS } from '../../api/customersList';
import { createOwnSearchTracker, withUrlSearch } from '../../utils/urlSearch';

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

describe('createOwnSearchTracker', () => {
    it('ignores a late older route update after a faster typed value', () => {
        const own = createOwnSearchTracker();
        own.typed('a');
        own.typed('ab');
        expect(own.isOwnEcho('a')).toBe(true);
        expect(own.isOwnEcho('ab')).toBe(true);
    });

    it('treats a value the list never typed as an outside navigation', () => {
        const own = createOwnSearchTracker();
        own.typed('ab');
        expect(own.isOwnEcho('other')).toBe(false);
        expect(own.isOwnEcho(undefined)).toBe(false);
    });

    it('does not swallow the same value twice once its echo was consumed', () => {
        const own = createOwnSearchTracker();
        own.typed('a');
        expect(own.isOwnEcho('a')).toBe(true);
        expect(own.isOwnEcho('a')).toBe(false);
    });
});
