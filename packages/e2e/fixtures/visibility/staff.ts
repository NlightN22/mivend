import { adminGql } from '../../helpers/api';
import { ACTORS, VIS_PASSWORD, actorEmail } from './plan';

// Administrator logins cannot be expressed as an import record (same exception as seed-erp.mjs).
export async function seedStaff(superadmin: string): Promise<void> {
    const { data } = await adminGql<{ roles: { items: { id: string; code: string }[] } }>(
        `{ roles(options: { take: 50 }) { items { id code } } }`,
        undefined,
        superadmin,
    );
    for (const actor of ACTORS) {
        const roleId = data.roles.items.find(r => r.code === actor.role)?.id;
        if (!roleId) throw new Error(`Role ${actor.role} is not provisioned`);
        await adminGql(
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: 'E2E Vis',
                    lastName: actor.key,
                    emailAddress: actorEmail(actor.key),
                    password: VIS_PASSWORD,
                    roleIds: [roleId],
                },
            },
            superadmin,
        );
    }
}
