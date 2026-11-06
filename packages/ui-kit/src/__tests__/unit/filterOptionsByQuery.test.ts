import { describe, expect, it } from 'vitest';
import { filterOptionsByQuery } from '../../components/MvColumnFilter/filterOptionsByQuery';

const OPTIONS = [
    { value: 'a', label: 'Sales' },
    { value: 'b', label: 'Stock' },
    { value: 'c', label: 'Purchasing' },
];

describe('filterOptionsByQuery', () => {
    it('returns every option for a blank query', () => {
        expect(filterOptionsByQuery(OPTIONS, '  ')).toEqual(OPTIONS);
    });

    it('matches labels case-insensitively as a substring', () => {
        expect(filterOptionsByQuery(OPTIONS, 'ST').map(o => o.value)).toEqual(['b']);
        expect(filterOptionsByQuery(OPTIONS, 'ing').map(o => o.value)).toEqual(['c']);
    });

    it('returns nothing when no label matches', () => {
        expect(filterOptionsByQuery(OPTIONS, 'zzz')).toEqual([]);
    });
});
