import { describe, expect, it } from 'vitest';

import { statementScope } from '../../settlement-statement-scope';

describe('statementScope', () => {
    it('always scopes to the counterparty and customer contracts', () => {
        const { params, where } = statementScope('7', {});
        expect(params).toEqual(['7']);
        expect(where).toContain('c."isCustomerContract" IS TRUE');
        expect(where).toContain('e."counterpartyId" = $1');
    });

    it('binds contract, organization and a valid period but ignores a malformed date', () => {
        const { params, where } = statementScope('7', {
            contractId: 'c1',
            organizationId: 'o1',
            dateFrom: '2026-01-01',
            dateTo: 'garbage',
        });
        expect(params).toEqual(['7', 'c1', 'o1', '2026-01-01']);
        expect(where).toHaveLength(7);
    });

    it('does not carry the search, category or status filters', () => {
        const { params } = statementScope('7', {
            search: 'x',
            category: 'sale',
            overdueOnly: true,
        });
        expect(params).toEqual(['7']);
    });
});
