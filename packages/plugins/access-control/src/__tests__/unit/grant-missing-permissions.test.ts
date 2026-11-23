import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLES } from '../../default-roles';
import {
    PERMISSIONS_ADDED_BY_RELEASE,
    SCOPE_KEYS_ADDED_BY_RELEASE,
} from '../../default-role-release-grants';
import { planRoleGrants } from '../../grant-missing-permissions';
import { DEFAULT_ROLE_PERMISSIONS_AT_1_1_18 } from './default-role-permissions-baseline';

const perm = [{ release: 'r1', roleCode: 'manager', permission: 'NewRight' }];

describe('release grant entries', () => {
    it('name existing default roles and rights the code lists for that role', () => {
        for (const grant of PERMISSIONS_ADDED_BY_RELEASE) {
            const role = DEFAULT_ROLES.find(d => d.code === grant.roleCode);
            expect(role?.permissions).toContain(grant.permission);
        }
        for (const grant of SCOPE_KEYS_ADDED_BY_RELEASE) {
            const role = DEFAULT_ROLES.find(d => d.code === grant.roleCode);
            expect(role?.accessScopeConfig).toHaveProperty(grant.resource);
        }
    });

    it('deliver the 1.1.8 power-of-attorney right to its four roles', () => {
        const grants = PERMISSIONS_ADDED_BY_RELEASE.filter(g => g.release === '1.1.8');
        expect(grants.map(g => g.roleCode).sort()).toEqual([
            'department-head',
            'general-director',
            'portal-admin',
            'security-officer',
        ]);
    });

    it('list every right a default role gained after the baseline, so existing roles receive it', () => {
        const listed = new Set(
            PERMISSIONS_ADDED_BY_RELEASE.map(g => `${g.roleCode}:${g.permission}`),
        );
        const missing = DEFAULT_ROLES.flatMap(role =>
            role.permissions
                .filter(p => !DEFAULT_ROLE_PERMISSIONS_AT_1_1_18[role.code]?.includes(p))
                .filter(p => !listed.has(`${role.code}:${p}`))
                .map(p => `${role.code}:${p}`),
        );
        expect(missing).toEqual([]);
    });
});

describe('manager card grant', () => {
    it('delivers ReadManagerCard to manager, department-head and general-director in 1.1.19', () => {
        const roles = PERMISSIONS_ADDED_BY_RELEASE.filter(
            g => g.permission === 'ReadManagerCard' && g.release === '1.1.19',
        );
        expect(roles.map(g => g.roleCode).sort()).toEqual([
            'department-head',
            'general-director',
            'manager',
        ]);
    });
});

describe('portal-admin role visibility grant', () => {
    it('gives portal-admin every right the other roles hold, so core lists those roles for it', () => {
        const rights = PERMISSIONS_ADDED_BY_RELEASE.filter(
            g => g.roleCode === 'portal-admin' && g.release === '1.1.39',
        ).map(g => g.permission);
        expect(rights.sort()).toEqual([
            'ReadAnalytics',
            'ReadManagerCard',
            'RemoveCounterpartyManager',
        ]);
        const portalAdmin = DEFAULT_ROLES.find(r => r.code === 'portal-admin')!.permissions;
        for (const role of DEFAULT_ROLES) {
            for (const right of role.permissions) expect(portalAdmin, role.code).toContain(right);
        }
    });
});

describe('analytics grant', () => {
    it('delivers ReadAnalytics to manager, department-head and general-director, not the operator', () => {
        const roles = PERMISSIONS_ADDED_BY_RELEASE.filter(
            g => g.permission === 'ReadAnalytics' && g.release === '1.1.22',
        );
        expect(roles.map(g => g.roleCode).sort()).toEqual([
            'department-head',
            'general-director',
            'manager',
        ]);
    });
});

describe('planRoleGrants', () => {
    it('first run: adds an unrecorded right the role lacks, keeps hand-granted ones, records it', () => {
        const plan = planRoleGrants(
            'manager',
            ['Authenticated', 'Hand'],
            null,
            new Set(),
            perm,
            [],
        );
        expect(plan.permissions).toEqual(['Authenticated', 'Hand', 'NewRight']);
        expect(plan.record).toEqual(['NewRight']);
    });

    it('records without changing a role that already holds the right', () => {
        const plan = planRoleGrants('manager', ['NewRight'], null, new Set(), perm, []);
        expect(plan.permissions).toEqual(['NewRight']);
        expect(plan.added).toEqual([]);
        expect(plan.record).toEqual(['NewRight']);
    });

    it('does not re-add a recorded right an admin removed', () => {
        const plan = planRoleGrants(
            'manager',
            ['Authenticated'],
            null,
            new Set(['NewRight']),
            perm,
            [],
        );
        expect(plan.permissions).toEqual(['Authenticated']);
        expect(plan.record).toEqual([]);
    });

    it('ignores entries of another role', () => {
        const plan = planRoleGrants('operator', ['Authenticated'], null, new Set(), perm, []);
        expect(plan.permissions).toEqual(['Authenticated']);
    });

    it('adds a missing scope key from DEFAULT_ROLES without touching existing keys', () => {
        const withKey = [{ release: 'r2', roleCode: 'manager', resource: 'order' }];
        const plan = planRoleGrants('manager', [], { counterparty: 'all' }, new Set(), [], withKey);
        expect(plan.scope).toEqual({
            counterparty: 'all',
            order: DEFAULT_ROLES.find(d => d.code === 'manager')!.accessScopeConfig.order,
        });
        expect(plan.record).toEqual(['scope:order']);
    });

    it('never changes an existing scope key value, and skips a missing scope row', () => {
        const withKey = [{ release: 'r2', roleCode: 'manager', resource: 'order' }];
        const kept = planRoleGrants('manager', [], { order: 'all' }, new Set(), [], withKey);
        expect(kept.scope).toEqual({ order: 'all' });
        const none = planRoleGrants('manager', [], null, new Set(), [], withKey);
        expect(none.record).toEqual([]);
    });
});
