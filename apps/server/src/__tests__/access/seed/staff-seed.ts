import { gqlOk } from '../harness/graphql';
import type { ImportTarget } from './erp-import-seed';
import { STAFF, STAFF_PASSWORD, staffEmail } from './fixture-plan';

// Administrator logins cannot be expressed as an import record (same exception as seed-erp.mjs).
export async function seedStaff(target: ImportTarget, superadmin: string): Promise<void> {
    const roles = await gqlOk<{ roles: { items: { id: string; code: string }[] } }>(
        target.baseUrl,
        'admin-api',
        `{ roles(options: { take: 50 }) { items { id code } } }`,
        undefined,
        superadmin,
    );
    const roleId = new Map(roles.roles.items.map(r => [r.code, r.id]));
    // A bare SuperAdmin role has no scope row (own scope); every contour's superadmin is also portal-admin.
    const me = await gqlOk<{ activeAdministrator: { id: string } }>(
        target.baseUrl,
        'admin-api',
        `{ activeAdministrator { id } }`,
        undefined,
        superadmin,
    );
    await gqlOk(
        target.baseUrl,
        'admin-api',
        `mutation($input: UpdateAdministratorInput!) { updateAdministrator(input: $input) { id } }`,
        {
            input: {
                id: me.activeAdministrator.id,
                roleIds: [roleId.get('__super_admin_role__'), roleId.get('portal-admin')],
            },
        },
        superadmin,
    );
    for (const staff of STAFF) {
        const id = roleId.get(staff.role);
        if (!id) throw new Error(`Role ${staff.role} is not provisioned`);
        await gqlOk(
            target.baseUrl,
            'admin-api',
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: 'Access',
                    lastName: staff.key,
                    emailAddress: staffEmail(staff.key),
                    password: STAFF_PASSWORD,
                    roleIds: [id],
                },
            },
            superadmin,
        );
    }
    const response = await fetch(`${target.baseUrl}/erp/import/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${target.token}` },
        body: JSON.stringify({
            exchangeId: 'access-seed-employee',
            records: STAFF.map(staff => ({
                type: 'employee',
                data: {
                    erpId: `access-emp-${staff.key}`,
                    email: staffEmail(staff.key),
                    departmentErpId: staff.department,
                    roleCode: staff.role,
                },
            })),
        }),
    });
    const body = (await response.json()) as { failed?: number };
    if (!response.ok || (body.failed ?? 0) > 0)
        throw new Error(`erp-import employee failed: ${JSON.stringify(body)}`);
}
