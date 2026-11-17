import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ManagerCardService } from '../../manager-card.service';

type Scope = Record<string, unknown>;

const open = (
    scope: Scope,
    admin: { department: string | null; name: string } | null,
    id = '7',
): Promise<string | null> => {
    const connection = {
        getRepository: () => ({ query: async () => (admin ? [admin] : []) }),
    };
    const accessScope = { resolveCounterpartyScope: async () => scope };
    const service = new ManagerCardService(connection as never, {} as never, accessScope as never);
    return service.openName({} as RequestContext, id);
};

const manager = { department: 'dept-a', name: 'Petr Manager' };

describe('manager card access', () => {
    it('opens the own card', async () => {
        expect(await open({ kind: 'own', administratorId: 7 }, manager)).toBe('Petr Manager');
    });

    it('hides another manager from an own-scope viewer', async () => {
        expect(await open({ kind: 'own', administratorId: 8 }, manager)).toBeNull();
    });

    it('opens a manager of the same department for a department scope', async () => {
        expect(
            await open({ kind: 'department', administratorId: 8, departmentId: 'dept-a' }, manager),
        ).toBe('Petr Manager');
    });

    it('hides a manager of another department', async () => {
        expect(
            await open({ kind: 'department', administratorId: 8, departmentId: 'dept-b' }, manager),
        ).toBeNull();
    });

    it('opens a granted manager of another department', async () => {
        const scope = {
            kind: 'department',
            administratorId: 8,
            departmentId: 'dept-b',
            grantedManagerIds: ['7'],
        };
        expect(await open(scope, manager)).toBe('Petr Manager');
    });

    it('opens any manager for scope all', async () => {
        expect(await open({ kind: 'all' }, manager)).toBe('Petr Manager');
    });

    it('answers a deleted or missing manager like a hidden one, even for scope all', async () => {
        expect(await open({ kind: 'all' }, null)).toBeNull();
    });
});
