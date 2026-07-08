import { describe, it, expect } from 'vitest';
import type { Role } from '@vendure/core';

import { RoleScopeConfigService } from '../../role-scope-config.service';

function roleWithConfig(code: string, config: Record<string, string> | null): Role {
    return {
        code,
        customFields: { accessScopeConfig: config ? JSON.stringify(config) : null },
    } as unknown as Role;
}

describe('RoleScopeConfigService', () => {
    const service = new RoleScopeConfigService();

    it('returns "own" for a role scoped to own', () => {
        const role = roleWithConfig('sales-rep', { counterparty: 'own' });
        expect(service.maxScopeFor([role], 'counterparty')).toBe('own');
    });

    it('returns "department" for a role scoped to department', () => {
        const role = roleWithConfig('branch-manager', { counterparty: 'department' });
        expect(service.maxScopeFor([role], 'counterparty')).toBe('department');
    });

    it('returns "all" for a role scoped to all', () => {
        const role = roleWithConfig('central-admin', { counterparty: 'all' });
        expect(service.maxScopeFor([role], 'counterparty')).toBe('all');
    });

    it('picks the widest scope across multiple roles', () => {
        const roles = [
            roleWithConfig('sales-rep', { counterparty: 'own' }),
            roleWithConfig('branch-manager', { counterparty: 'department' }),
        ];
        expect(service.maxScopeFor(roles, 'counterparty')).toBe('department');
    });

    it('falls back to "own" for a role with no config, never "all"', () => {
        const role = roleWithConfig('unrecognized-role', null);
        expect(service.maxScopeFor([role], 'counterparty')).toBe('own');
    });

    it('falls back to "own" when the resource is not present in the config', () => {
        const role = roleWithConfig('order-only-role', { order: 'all' });
        expect(service.maxScopeFor([role], 'counterparty')).toBe('own');
    });

    it('falls back to "own" on invalid JSON instead of throwing', () => {
        const role = {
            code: 'broken-role',
            customFields: { accessScopeConfig: '{not json' },
        } as unknown as Role;
        expect(service.maxScopeFor([role], 'counterparty')).toBe('own');
    });
});
