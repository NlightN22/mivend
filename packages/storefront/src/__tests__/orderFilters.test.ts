import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SOURCE,
    DEFAULT_STATUS,
    buildStatusFilters,
    resolveStatusFilter,
    sourceIsExternal,
} from '../pages/orders/orderFilters';

const GROUPS = ['pending', 'confirmed', 'in_transit', 'delivered', 'cancelled'].map(key => ({
    key,
    label: key,
}));

describe('order list filters', () => {
    it('opens on Active, placed here', () => {
        expect(buildStatusFilters(GROUPS)[0].key).toBe(DEFAULT_STATUS);
        expect(sourceIsExternal(DEFAULT_SOURCE)).toBe(false);
    });

    it('builds one tab per dictionary group, in dictionary order', () => {
        expect(buildStatusFilters(GROUPS).map(f => f.key)).toEqual([
            'active',
            'pending',
            'confirmed',
            'in_transit',
            'delivered',
            'cancelled',
            'all',
        ]);
    });

    it('Active is the complement of the final statuses, so unknown statuses stay visible', () => {
        const active = resolveStatusFilter(buildStatusFilters(GROUPS), 'active');
        expect(active.groups).toBeNull();
        expect(active.excludeFinal).toBe(true);
    });

    it('a new group gets a tab labelled by its dictionary name, after the known ones', () => {
        const filters = buildStatusFilters([...GROUPS, { key: 'returned', label: 'Returned' }]);
        expect(filters.map(f => f.key).slice(-2)).toEqual(['returned', 'all']);
        expect(filters.find(f => f.key === 'returned')).toMatchObject({
            label: 'Returned',
            groups: ['returned'],
        });
    });

    it('camel-cases snake_case group keys into the i18n key', () => {
        const tab = buildStatusFilters(GROUPS).find(f => f.key === 'in_transit');
        expect(tab?.labelKey).toBe('orders.filters.inTransit');
    });

    it('a group missing from the dictionary has no tab; all means no restriction', () => {
        const filters = buildStatusFilters(GROUPS.slice(0, 1));
        expect(filters.map(f => f.key)).toEqual(['active', 'pending', 'all']);
        expect(resolveStatusFilter(filters, 'all').groups).toBeNull();
        expect(resolveStatusFilter(filters, 'bogus').key).toBe('active');
    });

    it('maps sources', () => {
        expect(sourceIsExternal('erp')).toBe(true);
        expect(sourceIsExternal('all')).toBeUndefined();
    });
});
