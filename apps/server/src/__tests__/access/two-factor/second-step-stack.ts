import { resolve } from 'path';
import { Client } from 'pg';
import { inject } from 'vitest';
import { hotp, timeStep, base32Decode } from '@mivend/plugin-two-factor';

import { staffToken } from '../harness/actors';
import { gql, gqlOk, type ApiKind, type GqlResult } from '../harness/graphql';
import { spawnGroup, startServer, stopGroup, type RunningServer } from '../harness/server-process';
import { testDbConnection } from '../harness/test-database';

const LOG_DIR = resolve(__dirname, '../../../../.access-test');
export const PASSWORD = 'two-factor-access-password';

export interface Account {
    api: ApiKind;
    username: string;
}

export interface Stack {
    url: string;
    call: <T = Record<string, unknown>>(
        api: ApiKind,
        query: string,
        variables?: Record<string, unknown>,
        token?: string,
        headers?: Record<string, string>,
    ) => Promise<GqlResult<T>>;
    stop(): Promise<void>;
}

// A second server on the same database with the obligation on, plus the mail worker its links need.
export async function startSecondStepStack(extraEnv: Record<string, string> = {}): Promise<Stack> {
    const env = {
        ...inject('accessServerEnv'),
        TWO_FACTOR_REQUIRED: 'true',
        EMAIL_DEV_MAILBOX_ENABLED: 'true',
        ...extraEnv,
    };
    const server: RunningServer = await startServer(env, resolve(LOG_DIR, 'server-two-factor.log'));
    const mailWorker = spawnGroup(
        'src/worker-email.ts',
        env,
        resolve(LOG_DIR, 'worker-two-factor.log'),
    );
    return {
        url: server.baseUrl,
        call: (api, query, variables, token, headers) =>
            gql(server.baseUrl, api, query, variables, token, headers),
        stop: async () => {
            await stopGroup(mailWorker);
            await server.stop();
        },
    };
}

// Accounts nobody else uses: recovery ends every session of the account.
export async function createAccounts(): Promise<{
    admin: Account;
    customer: Account;
    created: { administratorId: string; customerId: string };
}> {
    const baseUrl = inject('accessBaseUrl');
    const superadmin = await staffToken('superadmin');
    const roles = await gqlOk<{ roles: { items: { id: string; code: string }[] } }>(
        baseUrl,
        'admin-api',
        `{ roles(options: { take: 50 }) { items { id code } } }`,
        undefined,
        superadmin,
    );
    const roleId = roles.roles.items.find(r => r.code === 'manager')?.id;
    if (!roleId) throw new Error('manager role is not provisioned');
    const admin = { api: 'admin-api' as const, username: 'second-step-admin@access.test' };
    const customer = { api: 'shop-api' as const, username: 'second-step-customer@access.test' };
    const createdAdmin = await gqlOk<{ createAdministrator: { id: string } }>(
        baseUrl,
        'admin-api',
        `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
        {
            input: {
                firstName: 'Second',
                lastName: 'Step',
                emailAddress: admin.username,
                password: PASSWORD,
                roleIds: [roleId],
            },
        },
        superadmin,
    );
    const createdCustomer = await gqlOk<{ createCustomer: { id?: string } }>(
        baseUrl,
        'admin-api',
        `mutation($input: CreateCustomerInput!, $password: String) {
            createCustomer(input: $input, password: $password) { ... on Customer { id } } }`,
        {
            input: { emailAddress: customer.username, firstName: 'Second', lastName: 'Step' },
            password: PASSWORD,
        },
        superadmin,
    );
    return {
        admin,
        customer,
        created: {
            administratorId: createdAdmin.createAdministrator.id,
            customerId: createdCustomer.createCustomer.id!,
        },
    };
}

// Soft-deleted, so the accounts drop out of every list the other specs read.
export async function removeAccounts(created: {
    administratorId: string;
    customerId: string;
}): Promise<void> {
    const baseUrl = inject('accessBaseUrl');
    const superadmin = await staffToken('superadmin');
    await gqlOk(
        baseUrl,
        'admin-api',
        `mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`,
        { id: created.administratorId },
        superadmin,
    );
    await gqlOk(
        baseUrl,
        'admin-api',
        `mutation($id: ID!) { deleteCustomer(id: $id) { result } }`,
        { id: created.customerId },
        superadmin,
    );
}

export async function removeFactors(): Promise<void> {
    const client = new Client({ ...testDbConnection(), database: inject('accessDatabase') });
    await client.connect();
    try {
        await client.query('DELETE FROM two_factor_factor');
        await client.query('DELETE FROM two_factor_token');
    } finally {
        await client.end();
    }
}

export function codeFor(secret: string, stepOffset = 0): string {
    return hotp(base32Decode(secret), timeStep(Date.now()) + stepOffset);
}

// A six-digit string that is not valid in the accepted window.
export function wrongCode(secret: string): string {
    const valid = new Set([-1, 0, 1, 2].map(offset => codeFor(secret, offset)));
    return ['000000', '111111', '222222'].find(code => !valid.has(code)) ?? '333333';
}

interface MailItem {
    fileName: string;
    recipient: string;
    subject: string;
}

async function mailFiles(url: string, recipient: string, subject: string): Promise<string[]> {
    const list = (await (await fetch(`${url}/mailbox/list`)).json()) as MailItem[];
    return list
        .filter(item => item.recipient === recipient && item.subject === subject)
        .map(item => item.fileName);
}

export async function mailCount(url: string, recipient: string, subject: string): Promise<number> {
    return (await mailFiles(url, recipient, subject)).length;
}

// The mailbox directory outlives runs, so only a mail that appears after `trigger` counts.
export async function tokenFromNewMail(
    url: string,
    recipient: string,
    subject: string,
    trigger: () => Promise<unknown>,
): Promise<string> {
    const before = new Set(await mailFiles(url, recipient, subject));
    await trigger();
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        const fresh = (await mailFiles(url, recipient, subject)).filter(f => !before.has(f)).pop();
        if (fresh) {
            const item = (await (
                await fetch(`${url}/mailbox/item/${encodeURIComponent(fresh)}`)
            ).json()) as { body: string };
            const token = /token=([^"&\s]+)/.exec(item.body)?.[1];
            if (token) return token;
        }
        await new Promise(done => setTimeout(done, 1000));
    }
    throw new Error(`no "${subject}" mail for ${recipient}`);
}
