import { describe, expect, it } from 'vitest';
import { buildBottomTabs } from '../../composables/bottomTabs';

const labels = {
    catalog: 'Catalogue',
    orders: 'Orders',
    favourites: 'Favourites',
    account: 'Account',
    more: 'More',
    signIn: 'Sign in',
};

describe('buildBottomTabs', () => {
    it('guests get only Catalogue and Sign in', () => {
        const tabs = buildBottomTabs({ loggedIn: false, active: null, favoritesCount: 0, labels });
        expect(tabs.map(t => t.key)).toEqual(['catalog', 'login']);
        expect(tabs[1].to).toBe('/login');
    });

    it('customers get five tabs with the favourites badge and one active tab', () => {
        const tabs = buildBottomTabs({
            loggedIn: true,
            active: 'orders',
            favoritesCount: 3,
            labels,
        });
        expect(tabs.map(t => t.key)).toEqual(['catalog', 'orders', 'favorites', 'cabinet', 'more']);
        expect(tabs.find(t => t.key === 'favorites')?.badgeCount).toBe(3);
        expect(tabs.filter(t => t.active).map(t => t.key)).toEqual(['orders']);
    });
});
