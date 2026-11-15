import { describe, expect, it } from 'vitest';

import { buildManagerList } from '../../counterparty-managers';

const links = new Map([
    ['admin-1', 'user-1'],
    ['admin-2', 'user-2'],
    ['admin-3', 'user-3'],
]);

describe('buildManagerList', () => {
    it('sends the owner as the main manager and the owner plus the team as the list', () => {
        expect(buildManagerList('admin-1', ['admin-2', 'admin-3'], links)).toEqual({
            managerId: 'user-1',
            managerIds: ['user-1', 'user-2', 'user-3'],
            unlinkedAdministratorIds: [],
        });
    });

    it('skips an administrator without an ERP user link and reports it', () => {
        expect(buildManagerList('admin-1', ['admin-9', 'admin-2'], links)).toEqual({
            managerId: 'user-1',
            managerIds: ['user-1', 'user-2'],
            unlinkedAdministratorIds: ['admin-9'],
        });
    });

    it('sends no main manager when the owner has no ERP link, but still lists the team', () => {
        expect(buildManagerList('admin-9', ['admin-2'], links)).toEqual({
            managerId: null,
            managerIds: ['user-2'],
            unlinkedAdministratorIds: ['admin-9'],
        });
    });

    it('lists an owner who is also a team member once, and handles no owner', () => {
        expect(buildManagerList('admin-1', ['admin-1'], links).managerIds).toEqual(['user-1']);
        expect(buildManagerList(null, ['admin-2'], links)).toEqual({
            managerId: null,
            managerIds: ['user-2'],
            unlinkedAdministratorIds: [],
        });
    });
});
