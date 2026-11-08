import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { testDbConnection } from '../harness/test-database';
import {
    PASSWORD,
    createAccounts,
    removeAccounts,
    tokenFromNewMail,
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

// Other access files soft-delete accounts with the same login, so only the live row counts.
async function flagFor(identifier: string, value?: boolean): Promise<boolean> {
    const client = new Client({ ...testDbConnection(), database: inject('accessDatabase') });
    await client.connect();
    try {
        if (value !== undefined) {
            await client.query(
                `UPDATE "user" SET "customFieldsPasswordchangerequired" = $2 WHERE identifier = $1 AND "deletedAt" IS NULL`,
                [identifier, value],
            );
        }
        const rows = await client.query(
            `SELECT "customFieldsPasswordchangerequired" AS flag FROM "user" WHERE identifier = $1 AND "deletedAt" IS NULL`,
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

async function maxFailures(): Promise<number> {
    const client = new Client({ ...testDbConnection(), database: inject('accessDatabase') });
    await client.connect();
    try {
        const rows = await client.query(
            'SELECT coalesce(max(failures), 0) AS n FROM sign_in_throttle',
        );
        return Number(rows.rows[0].n);
    } finally {
        await client.end();
    }
}

// Proves the login mutations run in a transaction: without the advisory lock all 12 would be verified and counted.
describe.each([['customer'], ['admin']] as const)('%s parallel wrong logins', kind => {
    it('verifies at most the threshold of them', async () => {
        await clearCounters();
        const account = accounts[kind];
        await Promise.all(
            Array.from({ length: 12 }, () => attempt(account, account.username, 'wrong-password')),
        );
        expect(await maxFailures()).toBeLessThanOrEqual(3);
        expect(await attempt(account, account.username, PASSWORD)).toMatchObject({
            __typename: 'InvalidCredentialsError',
        });
        await clearCounters();
    });
});

describe('shop resetPassword clears the forced password change flag', () => {
    it('after a reset by e-mail token', async () => {
        await clearCounters();
        const { customer } = accounts;
        await flagFor(customer.username, true);
        const token = await tokenFromNewMail(
            stack.url,
            customer.username,
            'Forgotten password reset',
            () =>
                stack.call(
                    'shop-api',
                    `mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`,
                    {
                        e: customer.username,
                    },
                ),
        );
        const reset = await stack.call(
            'shop-api',
            `mutation($t: String!, $p: String!) { resetPassword(token: $t, password: $p) { __typename } }`,
            { t: token, p: 'Reset-password-123456' },
        );
        expect(reset.errors).toEqual([]);
        expect(await flagFor(customer.username)).toBe(false);
    }, 150_000);
});

describe('one hammered login cannot starve the server', () => {
    it('answers another account promptly while 60 parallel guesses hit one login, identically', async () => {
        await clearCounters();
        const victim = accounts.customer;
        const started = Date.now();
        const burst = Array.from({ length: 60 }, () =>
            attempt(victim, victim.username, 'wrong-password'),
        );
        const other = await attempt(
            accounts.admin,
            accounts.admin.username,
            'Another-password-123456',
        );
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(other).toMatchObject({ __typename: 'CurrentUser' });
        const responses = await Promise.all(burst);
        for (const response of responses) expect(response).toEqual(responses[0]);
        expect(responses[0]).toMatchObject({ __typename: 'InvalidCredentialsError' });
        expect(await maxFailures()).toBeLessThanOrEqual(3);
        await clearCounters();
    }, 60_000);

    it('does not refuse the same account from another address as busy while one address hammers it', async () => {
        await clearCounters();
        const victim = accounts.customer;
        const started = Date.now();
        const burst = Array.from({ length: 60 }, () =>
            attempt(victim, victim.username, 'wrong-password'),
        );
        const owner = await stack.call<{ login: { __typename: string } }>(
            victim.api,
            LOGIN,
            { u: victim.username, p: 'Reset-password-123456' },
            undefined,
            { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
        );
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(owner.data?.login).toMatchObject({ __typename: 'CurrentUser' });
        await Promise.all(burst);
        await clearCounters();
    }, 60_000);
});
