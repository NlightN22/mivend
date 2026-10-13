import { describe, it, expect } from 'vitest';
import { OrganizationFieldResolver } from '../../documents.resolver';
import { OrganizationRequisites } from '../../entities/organization-requisites.entity';

function makeRequisites(overrides: Partial<OrganizationRequisites>): OrganizationRequisites {
    return {
        id: 1,
        erpId: 'erp-1',
        legalName: 'Org 1',
        inn: null,
        kpp: null,
        ogrn: null,
        legalAddress: null,
        bankName: null,
        bankAccount: null,
        bankBik: null,
        correspondentAccount: null,
        signatoryName: null,
        signatoryTitle: null,
        isActive: true,
        logoAssetId: null,
        ...overrides,
    } as OrganizationRequisites;
}

describe('OrganizationFieldResolver', () => {
    const resolver = new OrganizationFieldResolver();

    it('reports complete when legal name, inn and bank requisites are present', () => {
        const requisites = makeRequisites({
            inn: '1234567890',
            bankName: 'Bank',
            bankBik: '000000000',
            bankAccount: '000',
        });
        expect(resolver.hasCompleteRequisites(requisites)).toBe(true);
    });

    it('reports incomplete when inn or a bank field is missing, regardless of address', () => {
        const base = { inn: '1234567890', bankName: 'Bank', bankBik: '0', bankAccount: '0' };
        expect(
            resolver.hasCompleteRequisites(
                makeRequisites({ ...base, inn: null, legalAddress: 'a' }),
            ),
        ).toBe(false);
        expect(resolver.hasCompleteRequisites(makeRequisites({ ...base, bankBik: null }))).toBe(
            false,
        );
        expect(resolver.hasCompleteRequisites(makeRequisites(base))).toBe(true);
    });
});
