import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLES } from '../../default-roles';

const byCode = (code: string): string[] =>
    DEFAULT_ROLES.find(r => r.code === code)?.permissions ?? [];

describe('default roles: finance figures', () => {
    it('every role that reads counterparties also reads their balance, turnover and credit', () => {
        const readers = DEFAULT_ROLES.filter(r => r.permissions.includes('ReadCounterparty'));
        expect(readers.length).toBeGreaterThan(0);
        for (const role of readers) {
            expect(role.permissions, role.code).toContain('ReadCounterpartyCredit');
        }
    });
});

describe('default roles: check permissions (#237)', () => {
    it('every role that reads orders can read their check results', () => {
        const readers = DEFAULT_ROLES.filter(r => r.permissions.includes('ReadOrder'));
        expect(readers.length).toBeGreaterThan(0);
        for (const role of readers) {
            expect(role.permissions, role.code).toContain('ReadCheckResults');
        }
    });

    it('only leadership manages discount limits', () => {
        const managers = DEFAULT_ROLES.filter(r => r.permissions.includes('ManageDiscountLimits'));
        expect(managers.map(r => r.code).sort()).toEqual(['general-director']);
    });

    it('only leadership manages check policies', () => {
        const managers = DEFAULT_ROLES.filter(r => r.permissions.includes('ManageCheckPolicies'));
        expect(managers.map(r => r.code).sort()).toEqual(['general-director']);
        for (const code of ['operator', 'manager', 'department-head', 'security-officer']) {
            expect(byCode(code)).not.toContain('ManageCheckPolicies');
        }
    });

    it('roles that may recompute checks keep the staff order permission', () => {
        for (const code of ['operator', 'manager', 'department-head', 'general-director']) {
            expect(byCode(code)).toContain('ConfirmOrder');
        }
    });
});

describe('default roles: price type permissions (#235)', () => {
    it('ReadFloorPrice is gone and only leadership roles read confidential price types', () => {
        for (const role of DEFAULT_ROLES) expect(role.permissions).not.toContain('ReadFloorPrice');
        const readers = DEFAULT_ROLES.filter(r =>
            r.permissions.includes('ReadConfidentialPriceTypes'),
        ).map(r => r.code);
        expect(readers.sort()).toEqual(['department-head', 'general-director', 'security-officer']);
        for (const code of ['operator', 'manager']) {
            expect(byCode(code)).not.toContain('ReadConfidentialPriceTypes');
            expect(byCode(code)).not.toContain('ReadAllCustomerPriceTypes');
        }
    });
});

describe('default roles: category visibility', () => {
    it('general director holds UpdateCatalog, which the category visibility page needs', () => {
        for (const code of ['general-director']) {
            expect(byCode(code)).toContain('UpdateCatalog');
        }
    });
});

describe('default roles: shared table views', () => {
    it('only leadership and department heads manage team views', () => {
        const managers = DEFAULT_ROLES.filter(r =>
            r.permissions.includes('ManageSharedTableViews'),
        );
        expect(managers.map(r => r.code).sort()).toEqual(['department-head', 'general-director']);
    });
});

describe('default roles: deleted-contract powers of attorney (#333)', () => {
    it('roles above manager see them; operator and manager never do', () => {
        const holders = DEFAULT_ROLES.filter(r =>
            r.permissions.includes('ReadDeletedContractPowerOfAttorney'),
        );
        expect(holders.map(r => r.code).sort()).toEqual([
            'department-head',
            'general-director',
            'security-officer',
        ]);
    });
});

describe('default roles: user administration (#395)', () => {
    it('the portal admin manages staff accounts and nothing else', () => {
        const rights = byCode('portal-admin');
        expect(rights).toContain('ManageAdministratorLifecycle');
        expect(rights).toContain('ReadAdministrator');
        expect(rights).not.toContain('UpdateAdministrator');
        expect(rights).not.toContain('ManageAccessControl');
    });

    it('the portal admin reads the exchange health views but cannot change them', () => {
        const rights = byCode('portal-admin');
        expect(rights).toContain('ReadExchangeHealth');
        expect(rights).not.toContain('ManageErpIntegration');
        expect(rights).not.toContain('RecoverIntegrationEvents');
    });
});
