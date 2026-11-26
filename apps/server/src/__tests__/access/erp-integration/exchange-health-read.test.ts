import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import { gqlOk, login } from '../harness/graphql';

const PASSWORD = 'health-probe-pass-1';
const EMAIL = 'health-probe@access.test';

const READS: Record<string, string> = {
    consistencyReports: 'consistencyReports(options: { take: 1 }) { totalItems }',
    consistencySources: 'consistencySources { source }',
    exchangeHealth: 'exchangeHealth { state }',
    integrationStreamHealth: 'integrationStreamHealth { contractVersion }',
    integrationOutboxHealth: 'integrationOutboxHealth { eventType }',
    variantUnitHealth: 'variantUnitHealth { total }',
    variantOrganizationHealth: 'variantOrganizationHealth { total }',
    rejectedOrderCount: 'rejectedOrderCount',
    openErpReconciliationIssues: 'openErpReconciliationIssues(options: { take: 1 }) { totalItems }',
    integrationInboxIssues: 'integrationInboxIssues(options: { take: 1 }) { totalItems }',
    integrationOutboxProblems: 'integrationOutboxProblems(options: { take: 1 }) { totalItems }',
    kafkaConsumerLag: 'kafkaConsumerLag { topic }',
};

const WRITES: Record<string, string> = {
    replayFailedIntegrationInbox: 'replayFailedIntegrationInbox(ids: ["1"]) { id }',
    dismissFailedIntegrationInbox: 'dismissFailedIntegrationInbox(id: "1", reason: "probe")',
    requeueFailedIntegrationOutbox: 'requeueFailedIntegrationOutbox(ids: ["1"])',
    rebuildSkippedIntegrationOutbox: 'rebuildSkippedIntegrationOutbox(id: "1")',
    runErpReconciliation: 'runErpReconciliation { checked }',
    resolveErpReconciliationIssue:
        'resolveErpReconciliationIssue(id: "1", resolution: "probe") { id }',
};

describe('exchange health views (ReadExchangeHealth, read-only)', () => {
    const baseUrl = (): string => inject('accessBaseUrl');
    const created: { roleId?: string; adminId?: string } = {};
    let holderToken: string;

    beforeAll(async () => {
        const superadmin = await staffToken('superadmin');
        const role = await gqlOk<{ createRole: { id: string } }>(
            baseUrl(),
            'admin-api',
            `mutation($input: CreateRoleInput!) { createRole(input: $input) { id } }`,
            {
                input: {
                    code: 'probe-health-reader',
                    description: 'health probe',
                    permissions: ['ReadExchangeHealth'],
                },
            },
            superadmin,
        );
        created.roleId = role.createRole.id;
        const account = await gqlOk<{ createAdministrator: { id: string } }>(
            baseUrl(),
            'admin-api',
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: 'Health',
                    lastName: 'Probe',
                    emailAddress: EMAIL,
                    password: PASSWORD,
                    roleIds: [role.createRole.id],
                },
            },
            superadmin,
        );
        created.adminId = account.createAdministrator.id;
        holderToken = await login(baseUrl(), 'admin-api', EMAIL, PASSWORD);
    });

    afterAll(async () => {
        const superadmin = await staffToken('superadmin');
        if (created.adminId) {
            await admin(
                superadmin,
                `mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`,
                { id: created.adminId },
            );
        }
        if (created.roleId) {
            await admin(superadmin, `mutation($id: ID!) { deleteRole(id: $id) { result } }`, {
                id: created.roleId,
            });
        }
    });

    it.each(Object.entries(READS))('a holder of the right is let into %s', async (_name, body) => {
        const result = await admin(holderToken, `query { ${body} }`);

        expect(result.errors.join(' ')).not.toMatch(DENIED);
    });

    it.each(Object.entries(READS))(
        'a staff role without the right is denied %s',
        async (_n, body) => {
            const result = await admin(await staffToken('manager-a'), `query { ${body} }`);

            expect(result.errors.join(' ')).toMatch(DENIED);
        },
    );

    it.each(Object.entries(WRITES))(
        'a holder of the right is denied the action %s',
        async (_n, body) => {
            const result = await admin(holderToken, `mutation { ${body} }`);

            expect(result.errors.join(' ')).toMatch(DENIED);
        },
    );
});
