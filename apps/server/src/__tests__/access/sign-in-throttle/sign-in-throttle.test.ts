import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { testDbConnection } from '../harness/test-database';
import {
    PASSWORD,
    createAccounts,
    removeAccounts,
    startSecondStepStack,
    type Account,
    type Stack,
} from '../two-factor/second-step-stack';

// Throttling on, 3 failures lock a login+IP; the response must not tell unknown, existing and locked logins apart.
const LOGIN = `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
    __typename ... on InvalidCredentialsError { errorCode message authenticationError } } }`;
const CAPTCHA = `query($l: String!) { signInCaptchaRequirement(login: $l) { required siteKey } }`;

let stack: Stack;
let accounts: Awaited<ReturnType<typeof createAccounts>>;

async function clearCounters(): Promise<void> {
    const client = new Client({ ...testDbConnection(), database: inject('accessDatabase') });
    await client.connect();
    try {
        await client.query('DELETE FROM sign_in_throttle');
    } finally {
        await client.end();
    }
}

beforeAll(async () => {
    accounts = await createAccounts();
    stack = await startSecondStepStack({
        TWO_FACTOR_REQUIRED: 'false',
        SIGN_IN_THROTTLE_ENABLED: 'true',
        SIGN_IN_THROTTLE_LOGIN_IP_THRESHOLD: '3',
        SIGN_IN_THROTTLE_LOGIN_THRESHOLD: '50',
        SIGN_IN_THROTTLE_BASE_LOCK_SECONDS: '300',
        SIGN_IN_THROTTLE_MAX_LOCK_SECONDS: '600',
    });
    await clearCounters();
}, 360_000);

afterAll(async () => {
    await stack?.stop();
    await clearCounters();
    await removeAccounts(accounts.created);
});

async function attempt(account: Account, username: string, password: string) {
    const result = await stack.call<{ login: { __typename: string } }>(account.api, LOGIN, {
        u: username,
        p: password,
    });
    return result.data?.login;
}

describe.each([['customer'], ['admin']] as const)('%s sign-in throttling', kind => {
    it('answers unknown, existing and locked logins identically, even for the right password', async () => {
        const account = accounts[kind];
        const unknown = `nobody-${kind}@access.test`;
        const wrong: unknown[] = [];
        for (let i = 0; i < 3; i++) {
            wrong.push(await attempt(account, account.username, 'wrong-password'));
            wrong.push(await attempt(account, unknown, 'wrong-password'));
        }
        const lockedRight = await attempt(account, account.username, PASSWORD);
        const lockedUnknown = await attempt(account, unknown, PASSWORD);
        expect(wrong[0]).toMatchObject({ __typename: 'InvalidCredentialsError' });
        for (const response of [...wrong, lockedRight, lockedUnknown]) {
            expect(response).toEqual(wrong[0]);
        }
    });

    it('lets the right password in again once the counters are cleared', async () => {
        await clearCounters();
        const account = accounts[kind];
        expect(await attempt(account, account.username, PASSWORD)).toMatchObject({
            __typename: 'CurrentUser',
        });
    });
});

describe('captcha requirement', () => {
    it('is off without provider keys, for any login', async () => {
        const known = await stack.call<{ signInCaptchaRequirement: unknown }>('shop-api', CAPTCHA, {
            l: accounts.customer.username,
        });
        const unknown = await stack.call<{ signInCaptchaRequirement: unknown }>(
            'shop-api',
            CAPTCHA,
            { l: 'nobody@access.test' },
        );
        expect(known.data?.signInCaptchaRequirement).toEqual({ required: false, siteKey: null });
        expect(unknown.data).toEqual(known.data);
    });
});

const CHANGE_CUSTOMER = `mutation($c: String!, $n: String!) { updateCustomerPassword(currentPassword: $c, newPassword: $n) { __typename } }`;
const CHANGE_ADMIN = `mutation($n: String!) { updateActiveAdministrator(input: { password: $n }) { id } }`;

async function flagFor(identifier: string, value?: boolean): Promise<boolean> {
    const client = new Client({ ...testDbConnection(), database: inject('accessDatabase') });
    await client.connect();
    try {
        if (value !== undefined) {
            await client.query(
                `UPDATE "user" SET "customFieldsPasswordchangerequired" = $2 WHERE identifier = $1`,
                [identifier, value],
            );
        }
        const rows = await client.query(
            `SELECT "customFieldsPasswordchangerequired" AS flag FROM "user" WHERE identifier = $1`,
            [identifier],
        );
        return rows.rows[0].flag;
    } finally {
        await client.end();
    }
}

// Covers PasswordChangeFlagSubscriber on the real save path used by core's password changes.
describe.each([['customer'], ['admin']] as const)('%s forced password change flag', kind => {
    it('is cleared when the password is changed', async () => {
        await clearCounters();
        const account = accounts[kind];
        await flagFor(account.username, true);
        const login = await stack.call(account.api, LOGIN, { u: account.username, p: PASSWORD });
        expect(login.token).toBeTruthy();
        const next = 'Another-password-123456';
        const change =
            kind === 'customer'
                ? await stack.call(
                      'shop-api',
                      CHANGE_CUSTOMER,
                      { c: PASSWORD, n: next },
                      login.token ?? undefined,
                  )
                : await stack.call(
                      'admin-api',
                      CHANGE_ADMIN,
                      { n: next },
                      login.token ?? undefined,
                  );
        expect(change.errors).toEqual([]);
        expect(await flagFor(account.username)).toBe(false);
    });
});
