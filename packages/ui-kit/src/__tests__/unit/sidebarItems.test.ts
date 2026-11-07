import { describe, it, expect } from 'vitest';
import {
    groupBadgeCount,
    isGroupActive,
    isPathActive,
    type AppSidebarItem,
} from '../../components/MvAppSidebar/sidebar-items';

const documents: AppSidebarItem = {
    label: 'Documents',
    children: [
        { label: 'Orders', path: '/orders' },
        { label: 'Discount requests', path: '/discounts', badgeCount: 3 },
        { label: 'Payments', path: '/payments', badgeCount: 2 },
    ],
};

describe('sidebar items', () => {
    it('matches a path exactly or as a parent, and never "/" for other pages', () => {
        expect(isPathActive('/orders/123', '/orders')).toBe(true);
        expect(isPathActive('/orders-archive', '/orders')).toBe(false);
        expect(isPathActive('/orders', '/')).toBe(false);
        expect(isPathActive('/', '/')).toBe(true);
    });

    it('marks a group active when a child route is active', () => {
        expect(isGroupActive('/orders/123', documents)).toBe(true);
        expect(isGroupActive('/customers', documents)).toBe(false);
    });

    it('sums child badges for the collapsed group', () => {
        expect(groupBadgeCount(documents)).toBe(5);
    });
});
