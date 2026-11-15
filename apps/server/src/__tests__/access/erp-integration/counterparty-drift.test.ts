import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { DENIED, admin, customerToken, seed, staffToken } from '../harness/actors';
import { gqlOk, login } from '../harness/graphql';
import { ADD, REMOVE } from '../customer/portal-customer-queries';

const QUERIES = [
    'counterpartiesDifferingFromErp',
    'counterpartiesNotConfirmedByErp',
    'counterpartiesWithUnlinkedManagers',
] as const;
const list = (name: string, fields = 'id'): string =>
    `query { ${name}(options: { take: 100 }) { totalItems items { ${fields} } } }`;
const PASSWORD = 'drift-probe-pass-1';
const EMAIL = 'drift-probe@access.test';
const EMAIL_WITH_RIGHT = 'drift-probe-right@access.test';

type Page = Record<
    string,
    { totalItems: number; items: { id: string; creditLimit?: number | null }[] }
>;

// The reports are deliberately unscoped: ManageErpIntegration alone gates them, so a holder sees every record.
describe('counterparty ERP drift reports (ManageErpIntegration, unscoped)', () => {
    const baseUrl = (): string => inject('accessBaseUrl');
    const created: { roles: string[]; admins: string[] } = { roles: [], admins: [] };
    let holderToken: string;
    let unlinkedAdmin: string;
    const counterpartyId = (): string => seed().counterparties['a-free'];

    async function makeAdmin(email: string, permissions: string[]): Promise<string> {
        const superadmin = await staffToken('superadmin');
        const role = await gqlOk<{ createRole: { id: string } }>(
            baseUrl(),
            'admin-api',
            `mutation($input: CreateRoleInput!) { createRole(input: $input) { id } }`,
            {
                input: {
                    code: `probe-${email.split('@')[0]}`,
                    description: 'drift probe',
                    permissions,
                },
            },
            superadmin,
        );
        created.roles.push(role.createRole.id);
        const account = await gqlOk<{ createAdministrator: { id: string } }>(
            baseUrl(),
            'admin-api',
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: 'Drift',
                    lastName: 'Probe',
                    emailAddress: email,
                    password: PASSWORD,
                    roleIds: [role.createRole.id],
                },
            },
            superadmin,
        );
        created.admins.push(account.createAdministrator.id);
        return account.createAdministrator.id;
    }

    beforeAll(async () => {
        unlinkedAdmin = await makeAdmin(EMAIL, ['ReadCounterparty', 'ManageErpIntegration']);
        await makeAdmin(EMAIL_WITH_RIGHT, [
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ManageErpIntegration',
        ]);
        holderToken = await login(baseUrl(), 'admin-api', EMAIL_WITH_RIGHT, PASSWORD);
        const superadmin = await staffToken('superadmin');
        // An administrator with no ERP user link on the team: bumps the version and is reported as unlinked.
        await admin(superadmin, ADD, { c: counterpartyId(), a: unlinkedAdmin });
    });

    afterAll(async () => {
        const superadmin = await staffToken('superadmin');
        await admin(superadmin, REMOVE, { c: counterpartyId(), a: unlinkedAdmin });
        for (const id of created.admins) {
            await admin(
                superadmin,
                `mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`,
                { id },
            );
        }
        for (const id of created.roles) {
            await admin(superadmin, `mutation($id: ID!) { deleteRole(id: $id) { result } }`, {
                id,
            });
        }
    });

    it.each(QUERIES)(
        'a holder of the right sees every record in %s, the same as the superadmin',
        async name => {
            const [mine, all] = await Promise.all([
                admin<Page>(holderToken, list(name)),
                admin<Page>(await staffToken('superadmin'), list(name)),
            ]);

            expect(mine.errors).toEqual([]);
            expect(all.errors).toEqual([]);
            expect(mine.data![name].items.map(i => i.id).sort()).toEqual(
                all.data![name].items.map(i => i.id).sort(),
            );
        },
    );

    it('reports the counterparty whose team has an administrator without an ERP link', async () => {
        const result = await admin<Page>(holderToken, list('counterpartiesWithUnlinkedManagers'));

        expect(result.data!.counterpartiesWithUnlinkedManagers.items.map(i => i.id)).toContain(
            counterpartyId(),
        );
    });

    it.each(QUERIES)('a staff role without the right is denied %s', async name => {
        const result = await admin(await staffToken('manager-a'), list(name));

        expect(result.errors.join(' ')).toMatch(DENIED);
    });

    it.each(QUERIES)('a portal customer is denied %s on the admin API', async name => {
        const result = await admin(await customerToken('customer-a'), list(name));

        expect(result.errors.join(' ')).toMatch(DENIED);
    });

    it('credit fields stay hidden from a holder without ReadCounterpartyCredit', async () => {
        const token = await login(baseUrl(), 'admin-api', EMAIL, PASSWORD);

        const result = await admin<Page>(
            token,
            list('counterpartiesWithUnlinkedManagers', 'id creditLimit'),
        );

        expect(result.errors.join(' ')).toMatch(DENIED);
        const items = result.data!.counterpartiesWithUnlinkedManagers.items;
        expect(items.length).toBeGreaterThan(0);
        expect(items.every(i => i.creditLimit === null)).toBe(true);
    });

    it('a holder with ReadCounterpartyCredit reads the credit field', async () => {
        const result = await admin<Page>(
            holderToken,
            list('counterpartiesWithUnlinkedManagers', 'id creditLimit'),
        );

        expect(result.errors).toEqual([]);
    });
});
