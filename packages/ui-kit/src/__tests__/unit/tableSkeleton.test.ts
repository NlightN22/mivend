import { describe, expect, it } from 'vitest';
import {
    MAX_SKELETON_ROWS,
    isSkeletonRow,
    skeletonRowCount,
    skeletonRows,
} from '../../components/MvAdvancedDataTable/tableSkeleton';

describe('table skeleton rows', () => {
    it('follows the page size and is capped', () => {
        expect(skeletonRowCount(5)).toBe(5);
        expect(skeletonRowCount(100)).toBe(MAX_SKELETON_ROWS);
        expect(skeletonRowCount(0)).toBe(1);
    });

    it('builds placeholder rows under the data key that are recognised as skeletons', () => {
        const rows = skeletonRows('id', 3);
        expect(rows).toHaveLength(3);
        expect(new Set(rows.map(r => r.id)).size).toBe(3);
        expect(rows.every(r => isSkeletonRow(r, 'id'))).toBe(true);
        expect(isSkeletonRow({ id: '42' }, 'id')).toBe(false);
    });
});
