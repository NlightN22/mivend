import { adminGql, postBatch, waitForRun } from '../../helpers/api';
import { VIS_DEPARTMENTS, VIS_PASSWORD } from './plan';

export const TEAM_MEMBERS = {
    searchable: {
        firstName: 'E2E Team',
        lastName: 'Searchable',
        email: 'e2e-team-searchable@test.example',
        erpId: 'e2e-team-emp-searchable',
    },
    retired: {
        firstName: 'E2E Team',
        lastName: 'Retired',
        email: 'e2e-team-retired@test.example',
        erpId: 'e2e-team-emp-retired',
    },
} as const;

// Two operators in department A, one of them deactivated, for the Team directory specs.
export async function seedTeam(superadmin: string): Promise<void> {
    const { data } = await adminGql<{ roles: { items: { id: string; code: string }[] } }>(
        `{ roles(options: { take: 50 }) { items { id code } } }`,
        undefined,
        superadmin,
    );
    const roleId = data.roles.items.find(r => r.code === 'operator')?.id;
    if (!roleId) throw new Error('Role operator is not provisioned');
    const ids: string[] = [];
    for (const m of Object.values(TEAM_MEMBERS)) {
        const created = await adminGql<{ createAdministrator: { id: string } }>(
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: m.firstName,
                    lastName: m.lastName,
                    emailAddress: m.email,
                    password: VIS_PASSWORD,
                    roleIds: [roleId],
                },
            },
            superadmin,
        );
        ids.push(created.data.createAdministrator.id);
    }
    const exchangeId = `e2e-team-employees-${Date.now()}`;
    await postBatch(
        exchangeId,
        Object.values(TEAM_MEMBERS).map(m => ({
            type: 'employee',
            data: {
                erpId: m.erpId,
                email: m.email,
                departmentErpId: VIS_DEPARTMENTS.a,
                roleCode: 'operator',
            },
        })),
    );
    const run = await waitForRun(exchangeId);
    if (run.errors.length > 0)
        throw new Error(`team employees failed: ${JSON.stringify(run.errors)}`);
    await adminGql(
        `mutation($id: ID!) { setAdministratorActive(administratorId: $id, isActive: false) }`,
        { id: ids[1] },
        superadmin,
    );
}
