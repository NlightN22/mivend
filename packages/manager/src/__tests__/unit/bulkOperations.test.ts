import { describe, it, expect } from 'vitest';
import { availableBulkOperations, BULK_OPERATIONS } from '../../pages/bulk-operations/operations';

describe('availableBulkOperations', () => {
    it('lists Activate customers first for a holder of its permission', () => {
        const list = availableBulkOperations(name => name === 'ManageCounterpartyPortalAccess');
        expect(list[0].title).toBe('Activate customers');
        expect(list[0].path).toBe('/bulk-operations/activate-customers');
    });

    it('hides operations whose permission the caller lacks', () => {
        expect(availableBulkOperations(() => false)).toEqual([]);
    });

    it('gives every operation a unique key and path', () => {
        expect(new Set(BULK_OPERATIONS.map(o => o.key)).size).toBe(BULK_OPERATIONS.length);
        expect(new Set(BULK_OPERATIONS.map(o => o.path)).size).toBe(BULK_OPERATIONS.length);
    });
});
