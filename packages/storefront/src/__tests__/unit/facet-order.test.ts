import { describe, it, expect } from 'vitest';
import { orderFacetGroups } from '../../composables/facetOrder';

const value = (name: string, count: number) => ({ id: name, code: name, name, count });

describe('orderFacetGroups', () => {
    it('orders manufacturer values by count desc, ties by name', () => {
        const [group] = orderFacetGroups([
            {
                code: 'manufacturer',
                name: 'Manufacturer',
                values: [value('A', 2), value('C', 9), value('B', 2)],
            },
        ]);
        expect(group.values.map(v => v.name)).toEqual(['C', 'A', 'B']);
    });

    it('leaves other facet groups untouched', () => {
        const input = [{ code: 'color', name: 'Color', values: [value('A', 1), value('B', 5)] }];
        expect(orderFacetGroups(input)).toEqual(input);
    });
});
