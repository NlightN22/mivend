import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLES } from '../../default-roles';
import { grantMissingDefaultPermissions, type SqlClient } from '../../grant-missing-permissions';

function fakeDb(initial: Record<string, string>): {
    client: SqlClient;
    roles: Map<string, string>;
} {
    const roles = new Map(Object.entries(initial));
    const client: SqlClient = {
        async query(sql, params = []) {
            if (sql.startsWith('SELECT')) {
                const stored = roles.get(String(params[0]));
                return { rows: stored === undefined ? [] : [{ permissions: stored }] };
            }
            if (sql.startsWith('UPDATE')) roles.set(String(params[0]), String(params[1]));
            return { rows: [] };
        },
    };
    return { client, roles };
}

const full = (code: string): string => {
    const definition = DEFAULT_ROLES.find(d => d.code === code)!;
    return ['Authenticated', ...definition.permissions].join(',');
};

describe('grantMissingDefaultPermissions', () => {
    it('adds a right missing from a role and keeps every right already there, edits included', async () => {
        const { client, roles } = fakeDb({
            'department-head': `Authenticated,SomeHandGrantedRight`,
        });
        const outcomes = await grantMissingDefaultPermissions(client);

        const stored = roles.get('department-head')!.split(',');
        expect(stored).toContain('SomeHandGrantedRight');
        expect(stored).toContain('ReadDeletedContractPowerOfAttorney');
        expect(outcomes.map(o => o.roleCode)).toEqual(['department-head']);
    });

    it('is idempotent: the second run changes nothing', async () => {
        const { client, roles } = fakeDb({ manager: 'Authenticated' });
        await grantMissingDefaultPermissions(client);
        const afterFirst = roles.get('manager');
        const second = await grantMissingDefaultPermissions(client);

        expect(second).toEqual([]);
        expect(roles.get('manager')).toBe(afterFirst);
    });

    it('never removes a right and leaves a complete role and a missing role alone', async () => {
        const { client, roles } = fakeDb({ operator: full('operator') });
        const outcomes = await grantMissingDefaultPermissions(client);

        expect(outcomes).toEqual([]);
        expect(roles.get('operator')).toBe(full('operator'));
        expect(roles.has('manager')).toBe(false);
    });
});
