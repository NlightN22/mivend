import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLES } from '../../default-roles';

const byCode = (code: string) => DEFAULT_ROLES.find(r => r.code === code)?.permissions ?? [];

describe('default roles: check permissions (#237)', () => {
    it('every role that reads orders can read their check results', () => {
        const readers = DEFAULT_ROLES.filter(r => r.permissions.includes('ReadOrder'));
        expect(readers.length).toBeGreaterThan(0);
        for (const role of readers) {
            expect(role.permissions, role.code).toContain('ReadCheckResults');
        }
    });

    it('only leadership and the portal admin manage check policies', () => {
        const managers = DEFAULT_ROLES.filter(r => r.permissions.includes('ManageCheckPolicies'));
        expect(managers.map(r => r.code).sort()).toEqual(['general-director', 'portal-admin']);
        for (const code of ['operator', 'manager', 'department-head', 'security-officer']) {
            expect(byCode(code)).not.toContain('ManageCheckPolicies');
        }
    });

    it('roles that may recompute checks keep the staff order permission', () => {
        for (const code of [
            'operator',
            'manager',
            'department-head',
            'general-director',
            'portal-admin',
        ]) {
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
        expect(readers.sort()).toEqual([
            'department-head',
            'general-director',
            'portal-admin',
            'security-officer',
        ]);
        for (const code of ['operator', 'manager']) {
            expect(byCode(code)).not.toContain('ReadConfidentialPriceTypes');
            expect(byCode(code)).not.toContain('ReadAllCustomerPriceTypes');
        }
    });
});
