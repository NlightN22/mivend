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

    it('reports complete when both inn and legalAddress are present', () => {
        const requisites = makeRequisites({ inn: '1234567890', legalAddress: 'street-1' });
        expect(resolver.hasCompleteRequisites(requisites)).toBe(true);
    });

    it('reports incomplete when inn or legalAddress is missing', () => {
        const missingInn = makeRequisites({ inn: null, legalAddress: 'street-1' });
        const missingAddress = makeRequisites({ inn: '1234567890', legalAddress: null });
        expect(resolver.hasCompleteRequisites(missingInn)).toBe(false);
        expect(resolver.hasCompleteRequisites(missingAddress)).toBe(false);
    });
});
