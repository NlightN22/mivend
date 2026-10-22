import { adminGql } from '../../helpers/api';
import { ACTORS, VIS_PASSWORD, actorEmail } from './plan';

// Administrator logins cannot be expressed as an import record (same exception as seed-erp.mjs).
export async function ensureStaff(superadmin: string): Promise<void> {
    const { data } = await adminGql<{
        roles: { items: { id: string; code: string }[] };
        administrators: { items: { emailAddress: string }[] };
    }>(
        `{ roles(options: { take: 50 }) { items { id code } }
           administrators(options: { take: 100, filter: { emailAddress: { contains: "e2e-vis-" } } }) {
               items { emailAddress } } }`,
        undefined,
        superadmin,
    );
    const existing = new Set(data.administrators.items.map(a => a.emailAddress));
    for (const actor of ACTORS) {
        if (existing.has(actorEmail(actor.key))) continue;
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
