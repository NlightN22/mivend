import { beforeAll, describe, expect, it } from 'vitest';

import { admin, DENIED, seed, staffToken } from '../harness/actors';
import { login } from '../harness/graphql';
import { inject } from 'vitest';
import type { ActorKey } from '../seed/fixture-plan';

const ASSIGNABLE = `query { assignableAdministratorRoles { id code } }`;
const SET_ROLES = `mutation($id: ID!, $roleIds: [ID!]!) {
    setAdministratorRoles(administratorId: $id, roleIds: $roleIds) { id user { roles { code } } }
}`;
const ROLES_OF = `query($id: ID!) { administrator(id: $id) { user { roles { code } } } }`;
const SUPERADMIN_ID = `query { administrators(options: { filter: { emailAddress: { contains: "superadmin" } } }) { items { id user { roles { code } } } } }`;

const PORTAL_ADMIN = { email: 'portal-admin-395@access.test', password: 'Access-395-pass' };
let portalAdminToken = '';
let portalAdminId = '';

beforeAll(async () => {
    const superToken = await staffToken('superadmin');
    const roles = await admin<{ roles: { items: Role[] } }>(
        superToken,
        `query { roles(options: { filter: { code: { eq: "portal-admin" } } }) { items { id code } } }`,
    );
    const created = await admin<{ createAdministrator: { id: string } }>(
        superToken,
        `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
        {
            input: {
                emailAddress: PORTAL_ADMIN.email,
                firstName: 'Portal',
                lastName: 'Admin',
                password: PORTAL_ADMIN.password,
                roleIds: [roles.data!.roles.items[0]!.id],
            },
        },
    );
    expect(created.errors ?? []).toEqual([]);
    portalAdminId = created.data!.createAdministrator.id;
    portalAdminToken = await login(
        inject('accessBaseUrl'),
        'admin-api',
        PORTAL_ADMIN.email,
        PORTAL_ADMIN.password,
    );
});

interface Role {
    id: string;
    code: string;
}

async function assignable(actor: ActorKey | 'superadmin'): Promise<Role[]> {
    const result = await admin<{ assignableAdministratorRoles: Role[] }>(
        await staffToken(actor),
        ASSIGNABLE,
    );
    expect(result.errors ?? []).toEqual([]);
    return result.data!.assignableAdministratorRoles;
}

async function rolesOf(id: string): Promise<string[]> {
    const result = await admin<{ administrator: { user: { roles: { code: string }[] } } }>(
        await staffToken('superadmin'),
        ROLES_OF,
        { id },
    );
    return result.data!.administrator.user.roles.map(r => r.code).sort();
}

describe('setAdministratorRoles access', () => {
    it.each<ActorKey>(['manager-a', 'head-a', 'operator-a'])(
        '%s cannot list or assign roles',
        async actor => {
            const token = await staffToken(actor);
            const list = await admin(token, ASSIGNABLE);
            expect(list.errors?.[0]).toMatch(DENIED);
            const set = await admin(token, SET_ROLES, {
                id: seed().admins['manager-b'],
                roleIds: ['1'],
            });
            expect(set.errors?.[0]).toMatch(DENIED);
        },
    );

    it('offers the default roles and never the superadmin role', async () => {
        const codes = (await assignable('director')).map(r => r.code);
        expect(codes).toEqual(
            expect.arrayContaining(['operator', 'manager', 'department-head', 'general-director']),
        );
        expect(codes).not.toContain('__super_admin_role__');
    });

    it('assigns a role without the actor holding its rights, and restores it', async () => {
        const roles = await assignable('director');
        const head = roles.find(r => r.code === 'department-head')!;
        const manager = roles.find(r => r.code === 'manager')!;
        const target = seed().admins['manager-b'];
        const token = await staffToken('director');
        try {
            const set = await admin(token, SET_ROLES, { id: target, roleIds: [head.id] });
            expect(set.errors ?? []).toEqual([]);
            expect(await rolesOf(target)).toEqual(['department-head']);
        } finally {
            await admin(token, SET_ROLES, { id: target, roleIds: [manager.id] });
        }
        expect(await rolesOf(target)).toEqual(['manager']);
    });

    it('refuses own roles, a superadmin account, an unknown role and an empty list', async () => {
        const roles = await assignable('director');
        const manager = roles.find(r => r.code === 'manager')!;
        const token = await staffToken('director');
        const own = await admin(token, SET_ROLES, {
            id: seed().admins.director,
            roleIds: [manager.id],
        });
        expect(own.errors?.length).toBeGreaterThan(0);
        expect(await rolesOf(seed().admins.director)).toEqual(['general-director']);

        const superadmin = await admin<{
            administrators: { items: { id: string }[] };
        }>(await staffToken('superadmin'), SUPERADMIN_ID);
        const superId = superadmin.data!.administrators.items[0]!.id;
        const touched = await admin(token, SET_ROLES, { id: superId, roleIds: [manager.id] });
        expect(touched.errors?.length).toBeGreaterThan(0);
        expect(await rolesOf(superId)).toEqual(['__super_admin_role__', 'portal-admin']);

        const target = seed().admins['manager-b'];
        const unknown = await admin(token, SET_ROLES, { id: target, roleIds: ['999999'] });
        expect(unknown.errors?.length).toBeGreaterThan(0);
        const empty = await admin(token, SET_ROLES, { id: target, roleIds: [] });
        expect(empty.errors?.length).toBeGreaterThan(0);
        expect(await rolesOf(target)).toEqual(['manager']);
    });

    it('concurrent changes of one user end with exactly one chosen role', async () => {
        const roles = await assignable('director');
        const head = roles.find(r => r.code === 'department-head')!;
        const operator = roles.find(r => r.code === 'operator')!;
        const manager = roles.find(r => r.code === 'manager')!;
        const target = seed().admins['manager-b'];
        const token = await staffToken('director');
        try {
            await Promise.all([
                admin(token, SET_ROLES, { id: target, roleIds: [head.id] }),
                admin(token, SET_ROLES, { id: target, roleIds: [operator.id] }),
            ]);
            const final = await rolesOf(target);
            expect(final).toHaveLength(1);
            expect(['department-head', 'operator']).toContain(final[0]);
        } finally {
            await admin(token, SET_ROLES, { id: target, roleIds: [manager.id] });
        }
    });
});

describe('portal-admin as the user administrator', () => {
    it('assigns manager and department-head, and cannot use the native update or its own roles', async () => {
        const list = await admin<{ assignableAdministratorRoles: Role[] }>(
            portalAdminToken,
            ASSIGNABLE,
        );
        expect(list.errors ?? []).toEqual([]);
        const roles = list.data!.assignableAdministratorRoles;
        const head = roles.find(r => r.code === 'department-head')!;
        const manager = roles.find(r => r.code === 'manager')!;
        const target = seed().admins['manager-b'];
        try {
            const set = await admin(portalAdminToken, SET_ROLES, {
                id: target,
                roleIds: [head.id],
            });
            expect(set.errors ?? []).toEqual([]);
            expect(await rolesOf(target)).toEqual(['department-head']);
        } finally {
            await admin(portalAdminToken, SET_ROLES, { id: target, roleIds: [manager.id] });
        }
        const own = await admin(portalAdminToken, SET_ROLES, {
            id: portalAdminId,
            roleIds: [manager.id],
        });
        expect(own.errors?.length).toBeGreaterThan(0);
        const native = await admin(
            portalAdminToken,
            `mutation($id: ID!) { updateAdministrator(input: { id: $id, password: "Changed-395-pass" }) { id } }`,
            { id: target },
        );
        expect(native.errors?.[0]).toMatch(DENIED);
    });
});
