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
