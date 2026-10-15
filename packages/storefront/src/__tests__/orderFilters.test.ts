import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SOURCE,
    DEFAULT_STATUS,
    STATUS_FILTERS,
    sourceIsExternal,
    statusGroups,
} from '../pages/orders/orderFilters';

describe('order list filters', () => {
    it('opens on Active, placed here', () => {
        expect(STATUS_FILTERS[0].key).toBe(DEFAULT_STATUS);
        expect(DEFAULT_STATUS).toBe('active');
        expect(sourceIsExternal(DEFAULT_SOURCE)).toBe(false);
    });

    it('composes Active from unfinished groups plus rejected', () => {
        expect(statusGroups('active')).toEqual(['pending', 'confirmed', 'in_transit', 'rejected']);
    });

    it.each(['pending', 'confirmed', 'in_transit', 'delivered', 'cancelled'])(
        'keeps the old status=%s query value mapped to its own group',
        key => {
            expect(statusGroups(key)).toEqual([key]);
        },
    );

    it('all means no restriction; an unknown value falls back to Active', () => {
        expect(statusGroups('all')).toBeNull();
        expect(statusGroups('bogus')).toEqual(statusGroups('active'));
    });

    it('maps sources', () => {
        expect(sourceIsExternal('erp')).toBe(true);
        expect(sourceIsExternal('all')).toBeUndefined();
    });
});
