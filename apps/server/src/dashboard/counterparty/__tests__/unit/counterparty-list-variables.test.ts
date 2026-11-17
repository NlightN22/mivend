import { describe, expect, it } from 'vitest';

import { toCounterpartyListFilter } from '../../counterparty-list-variables';

describe('toCounterpartyListFilter', () => {
    it('unwraps array, { eq } and { contains } facet shapes plus the search term', () => {
        expect(
            toCounterpartyListFilter({
                __search: 'acme',
                _and: [{ isActive: { eq: 'active' } }, { managerErpId: { contains: 'mgr' } }],
            }),
        ).toEqual({ search: 'acme', status: 'active', managerErpId: 'mgr' });
        expect(toCounterpartyListFilter({ _and: [{ isActive: ['inactive'] }] }).status).toBe(
            'inactive',
        );
    });

    it('drops empty values so an unfiltered list sends an empty filter', () => {
        expect(toCounterpartyListFilter({ __search: '' })).toEqual({
            search: undefined,
            status: undefined,
            managerErpId: undefined,
        });
        expect(toCounterpartyListFilter(undefined)).toEqual({
            search: undefined,
            status: undefined,
            managerErpId: undefined,
        });
    });
});
