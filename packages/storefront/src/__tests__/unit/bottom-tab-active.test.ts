import { describe, expect, it } from 'vitest';
import { activeBottomTab } from '../../composables/bottomTabActive';

const closed = { moreOpen: false, catalogOpen: false };

describe('activeBottomTab', () => {
    it.each([
        ['/catalog', 'catalog'],
        ['/product/abc', 'catalog'],
        ['/orders/12', 'orders'],
        ['/favorites', 'favorites'],
        ['/account', 'cabinet'],
        ['/account/settings', 'more'],
        ['/documents', 'more'],
        ['/proforma-invoices/3', 'more'],
        ['/cart', null],
        ['/', null],
    ])('%s highlights %s', (path, tab) => {
        expect(activeBottomTab(path, closed)).toBe(tab);
    });

    it('an open More sheet wins over the route', () => {
        expect(activeBottomTab('/orders', { moreOpen: true, catalogOpen: false })).toBe('more');
    });

    it('an open catalogue wins over the route', () => {
        expect(activeBottomTab('/account', { moreOpen: false, catalogOpen: true })).toBe('catalog');
    });
});
