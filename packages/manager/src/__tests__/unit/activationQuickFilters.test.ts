import { describe, expect, it } from 'vitest';
import {
    quickValue,
    withQuickValue,
} from '../../components/bulk-operations/activationQuickFilters';

const inn = { columnKey: 'inn', operator: 'contains', value: '77' } as const;

describe('activation quick filters are views onto builder conditions', () => {
    it('sets, replaces and clears one column without touching the others', () => {
        let c = withQuickValue([inn], 'branch', 'eq', 'b1');
        expect(c).toEqual([inn, { columnKey: 'branch', operator: 'eq', value: 'b1' }]);
        expect(quickValue(c, 'branch', 'eq')).toBe('b1');
        c = withQuickValue(c, 'branch', 'eq', 'b2');
        expect(c.filter(x => x.columnKey === 'branch')).toHaveLength(1);
        expect(quickValue(c, 'branch', 'eq')).toBe('b2');
        expect(withQuickValue(c, 'branch', 'eq', '')).toEqual([inn]);
    });

    it('ignores a condition of the same column with another operator', () => {
        expect(
            quickValue([{ columnKey: 'branch', operator: 'notEq', value: 'b1' }], 'branch', 'eq'),
        ).toBe('');
    });
});
