import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SOURCE,
    DEFAULT_STATUS,
    buildStatusFilters,
    resolveStatusFilter,
    sourceIsExternal,
} from '../pages/orders/orderFilters';

const GROUPS = ['pending', 'confirmed', 'in_transit', 'delivered', 'cancelled', 'rejected'];

describe('order list filters', () => {
    it('opens on Active, placed here', () => {
        expect(buildStatusFilters(GROUPS)[0].key).toBe(DEFAULT_STATUS);
        expect(sourceIsExternal(DEFAULT_SOURCE)).toBe(false);
    });

    it('builds the approved tab order from the dictionary groups, no tab for rejected', () => {
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

    it('Active is the complement of the final groups, so unknown statuses stay visible', () => {
        const active = resolveStatusFilter(buildStatusFilters(GROUPS), 'active');
        expect(active.groups).toBeNull();
        expect(active.excludeGroups).toEqual(['delivered', 'cancelled']);
    });

    it('a new group gets a tab labelled by its raw key', () => {
        const tab = buildStatusFilters([...GROUPS, 'returned']).find(f => f.key === 'returned');
        expect(tab).toMatchObject({ labelKey: null, label: 'returned', groups: ['returned'] });
    });

    it('a group missing from the dictionary has no tab; all means no restriction', () => {
        const filters = buildStatusFilters(['pending']);
        expect(filters.map(f => f.key)).toEqual(['active', 'pending', 'all']);
        expect(resolveStatusFilter(filters, 'all').groups).toBeNull();
        expect(resolveStatusFilter(filters, 'bogus').key).toBe('active');
    });

    it('maps sources', () => {
        expect(sourceIsExternal('erp')).toBe(true);
        expect(sourceIsExternal('all')).toBeUndefined();
    });
});
