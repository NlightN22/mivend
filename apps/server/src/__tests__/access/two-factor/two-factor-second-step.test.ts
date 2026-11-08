import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DENIED } from '../harness/actors';
import {
    PASSWORD,
    codeFor,
    createAccounts,
    mailCount,
    removeAccounts,
    removeFactors,
    startSecondStepStack,
    tokenFromNewMail,
    wrongCode,
    type Account,
    type Stack,
} from './second-step-stack';

// With TWO_FACTOR_REQUIRED=true no route may yield a session from the password alone, nor from a wrong code.
const LOGIN = `mutation($u: String!, $p: String!) { login(username: $u, password: $p) {
    __typename ... on InvalidCredentialsError { authenticationError } } }`;
const AUTHENTICATE_NATIVE = `mutation($u: String!, $p: String!) { authenticate(input: { native: { username: $u, password: $p } }) {
    __typename ... on InvalidCredentialsError { authenticationError } } }`;
const START = `mutation($u: String!, $p: String!) { startTwoFactorSignIn(username: $u, password: $p) {
    __typename ... on TwoFactorChallenge { stage challenge } ... on TwoFactorError { failure } } }`;
const ENROL = `mutation($c: String, $p: String, $k: String) { startTwoFactorEnrolment(challenge: $c, password: $p, currentCode: $k) {
    __typename ... on TwoFactorEnrolment { secret otpauthUri } ... on TwoFactorError { failure } } }`;
const SECOND = `mutation($c: String!, $k: String!) { authenticate(input: { twoFactor: { challenge: $c, code: $k } }) {
    __typename ... on InvalidCredentialsError { authenticationError } ... on CurrentUser { identifier } } }`;
const ME = `{ me { identifier } }`;
const RECOVER = `mutation($c: String!) { requestTwoFactorRecovery(challenge: $c) {
    __typename ... on TwoFactorRecoveryRequested { success maskedEmailAddress } ... on TwoFactorError { failure } } }`;
const COMPLETE = `mutation($t: String!, $p: String!) { completeTwoFactorRecovery(token: $t, password: $p) {
    __typename ... on TwoFactorChallenge { stage challenge } ... on TwoFactorError { failure } } }`;
const RESET_REQUEST = `mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`;
const RESET = `mutation($t: String!, $p: String!) { resetPassword(token: $t, password: $p) { __typename } }`;
const RECOVERY_SUBJECT = 'Recover access to your authenticator';

let stack: Stack;
let accounts: Awaited<ReturnType<typeof createAccounts>>;

beforeAll(async () => {
    accounts = await createAccounts();
    stack = await startSecondStepStack();
}, 360_000);

afterAll(async () => {
    await stack?.stop();
    await removeFactors();
    await removeAccounts(accounts.created);
});

type Doc = { __typename: string; authenticationError?: string };

async function passwordLogin(account: Account, doc: string, password = PASSWORD) {
    const result = await stack.call<{ login?: Doc; authenticate?: Doc }>(account.api, doc, {
        u: account.username,
        p: password,
    });
    return { token: result.token, outcome: result.data?.login ?? result.data?.authenticate };
}

async function signInStep(account: Account) {
    const result = await stack.call<{
        startTwoFactorSignIn: {
            __typename: string;
            stage?: string;
            challenge?: string;
            failure?: string;
        };
    }>(account.api, START, { u: account.username, p: PASSWORD });
    return { token: result.token, ...result.data!.startTwoFactorSignIn };
}

async function secondStep(account: Account, challenge: string, code: string) {
    const result = await stack.call<{ authenticate: Doc }>(account.api, SECOND, {
        c: challenge,
        k: code,
    });
    return { token: result.token, outcome: result.data?.authenticate };
}

async function startEnrolment(
    account: Account,
    args: Record<string, string | null>,
    token?: string,
) {
    const result = await stack.call<{
        startTwoFactorEnrolment: { __typename: string; secret?: string; failure?: string };
    }>(account.api, ENROL, args, token);
    return { errors: result.errors, ...result.data?.startTwoFactorEnrolment };
}

const idle = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms));

async function waitForNextTimeStep(): Promise<void> {
    await idle(30_000 - (Date.now() % 30_000) + 1_000);
}

describe.each(['admin', 'customer'] as const)('%s account', kind => {
    const account = (): Account => accounts[kind];
    let secret: string;
    let enrolCode: string;
    let session: string;

    it('gets no session from the password alone on login or authenticate', async () => {
        for (const doc of [LOGIN, AUTHENTICATE_NATIVE]) {
            const { token, outcome } = await passwordLogin(account(), doc);
            expect(token).toBeNull();
            expect(outcome).toEqual({
                __typename: 'InvalidCredentialsError',
                authenticationError: 'TWO_FACTOR_REQUIRED',
            });
        }
        const wrong = await passwordLogin(account(), LOGIN, 'not-the-password');
        expect(wrong.token).toBeNull();
        expect(wrong.outcome?.authenticationError).toBe('');
    });

    it('hands out a challenge, not a session, after the password', async () => {
        const step = await signInStep(account());
        expect(step).toMatchObject({
            __typename: 'TwoFactorChallenge',
            stage: 'ENROL',
            token: null,
        });
        const wrong = await stack.call<{ startTwoFactorSignIn: { failure: string } }>(
            account().api,
            START,
            {
                u: account().username,
                p: 'not-the-password',
            },
        );
        expect(wrong.data?.startTwoFactorSignIn.failure).toBe('INVALID_CREDENTIALS');
        expect(wrong.token).toBeNull();
    });

    it('does not take a challenge for a session token', async () => {
        const step = await signInStep(account());
        const me = await stack.call<{ me: unknown }>(account().api, ME, undefined, step.challenge);
        expect(me.data?.me ?? null).toBeNull();
    });

    it('starts enrolment only with a challenge or a signed-in session plus the password', async () => {
        expect(
            (await startEnrolment(account(), { c: null, p: PASSWORD, k: null })).errors.join(),
        ).toMatch(DENIED);
        expect(await startEnrolment(account(), { c: 'bogus', p: null, k: null })).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });

    it('refuses a wrong code and opens a session only for the enrolling code', async () => {
        const { challenge } = await signInStep(account());
        const started = await startEnrolment(account(), { c: challenge!, p: null, k: null });
        expect(started.__typename).toBe('TwoFactorEnrolment');
        secret = started.secret!;

        const wrong = await secondStep(account(), challenge!, wrongCode(secret));
        expect(wrong.token).toBeNull();
        expect(wrong.outcome).toEqual({
            __typename: 'InvalidCredentialsError',
            authenticationError: 'TWO_FACTOR_INVALID_CODE',
        });
        expect((await stack.call(account().api, ME)).errors.length).toBeGreaterThan(0);

        enrolCode = codeFor(secret);
        const signedIn = await secondStep(account(), challenge!, enrolCode);
        expect(signedIn.outcome?.__typename).toBe('CurrentUser');
        expect(signedIn.token).toBeTruthy();
        session = signedIn.token!;
        const me = await stack.call<{ me: { identifier: string } }>(
            account().api,
            ME,
            undefined,
            session,
        );
        expect(me.data?.me.identifier).toBe(account().username);
    });

    it('still gives nothing for the password alone once a device is enrolled', async () => {
        for (const doc of [LOGIN, AUTHENTICATE_NATIVE]) {
            const { token, outcome } = await passwordLogin(account(), doc);
            expect(token).toBeNull();
            expect(outcome?.authenticationError).toBe('TWO_FACTOR_REQUIRED');
        }
        expect(await signInStep(account())).toMatchObject({ stage: 'VERIFY' });
    });

    it('rejects a replayed code, a wrong code and a challenge reused after success', async () => {
        const { challenge } = await signInStep(account());
        const replay = await secondStep(account(), challenge!, enrolCode);
        expect(replay.token).toBeNull();
        expect(replay.outcome?.authenticationError).toBe('TWO_FACTOR_INVALID_CODE');
        expect((await secondStep(account(), challenge!, wrongCode(secret))).token).toBeNull();

        const next = await secondStep(account(), challenge!, codeFor(secret, 1));
        expect(next.outcome?.__typename).toBe('CurrentUser');
        expect(next.token).toBeTruthy();
        const reuse = await secondStep(account(), challenge!, codeFor(secret, 1));
        expect(reuse.token).toBeNull();
        expect(reuse.outcome?.authenticationError).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    });

    it('does not let a sign-in challenge replace the enrolled device', async () => {
        const { challenge } = await signInStep(account());
        expect(await startEnrolment(account(), { c: challenge!, p: null, k: null })).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });

    it('needs the password and the current code to change the device', async () => {
        expect(
            await startEnrolment(account(), { c: null, p: 'not-the-password', k: null }, session),
        ).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
        expect(
            await startEnrolment(account(), { c: null, p: PASSWORD, k: null }, session),
        ).toMatchObject({
            failure: 'CODE_REQUIRED',
        });
    });

    it.runIf(kind === 'admin')(
        'takes "<password> <code>" on the admin login, checked together',
        async () => {
            await waitForNextTimeStep();
            const wrong = await passwordLogin(account(), LOGIN, `${PASSWORD} ${wrongCode(secret)}`);
            expect(wrong.token).toBeNull();
            expect(wrong.outcome?.authenticationError).toBe('TWO_FACTOR_INVALID_CODE');
            const right = await passwordLogin(
                account(),
                LOGIN,
                `${PASSWORD} ${codeFor(secret, 1)}`,
            );
            expect(right.outcome?.__typename).toBe('CurrentUser');
            expect(right.token).toBeTruthy();
        },
        90_000,
    );

    it.runIf(kind === 'customer')(
        'ignores a code appended to the password on the shop API',
        async () => {
            const { token, outcome } = await passwordLogin(
                account(),
                LOGIN,
                `${PASSWORD} ${codeFor(secret, 1)}`,
            );
            expect(token).toBeNull();
            expect(outcome?.authenticationError).toBe('');
        },
    );

    it('recovers a lost device only with the emailed link and the password', async () => {
        const request = async (challenge: string) =>
            (
                await stack.call<{
                    requestTwoFactorRecovery: {
                        __typename: string;
                        maskedEmailAddress?: string;
                        failure?: string;
                    };
                }>(account().api, RECOVER, { c: challenge })
            ).data!.requestTwoFactorRecovery;
        const mails = (): Promise<number> =>
            mailCount(stack.url, account().username, RECOVERY_SUBJECT);
        const before = await mails();
        for (const bad of ['not-a-challenge', 'x'.repeat(40)]) {
            expect(await request(bad)).toMatchObject({ failure: 'CHALLENGE_INVALID' });
        }
        await idle(3_000);
        expect(await mails()).toBe(before);

        const { challenge } = await signInStep(account());
        const link = await tokenFromNewMail(
            stack.url,
            account().username,
            RECOVERY_SUBJECT,
            async () => {
                const sent = await request(challenge!);
                expect(sent.__typename).toBe('TwoFactorRecoveryRequested');
                expect(sent.maskedEmailAddress).not.toContain(account().username);
                expect(sent.maskedEmailAddress).toMatch(/^.\*\*\*@/);
            },
        );
        expect(await mails()).toBe(before + 1);
        expect((await request(challenge!)).__typename).toBe('TwoFactorRecoveryRequested');
        await idle(3_000);
        expect(await mails()).toBe(before + 1);
        const complete = (password: string, token = link) =>
            stack.call<{
                completeTwoFactorRecovery: {
                    __typename: string;
                    stage?: string;
                    challenge?: string;
                    failure?: string;
                };
            }>(account().api, COMPLETE, { t: token, p: password });
        expect((await complete('not-the-password')).data?.completeTwoFactorRecovery).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
        expect((await stack.call(account().api, ME, undefined, session)).errors).toEqual([]);

        const done = (await complete(PASSWORD)).data!.completeTwoFactorRecovery;
        expect(done).toMatchObject({ __typename: 'TwoFactorChallenge', stage: 'ENROL' });
        expect(
            (await stack.call(account().api, ME, undefined, session)).errors.length,
        ).toBeGreaterThan(0);
        expect((await complete(PASSWORD)).data?.completeTwoFactorRecovery).toMatchObject({
            failure: 'RECOVERY_LINK_INVALID',
        });

        const oldDevice = await secondStep(account(), done.challenge!, codeFor(secret, 1));
        expect(oldDevice.token).toBeNull();
        const replacement = await startEnrolment(account(), {
            c: done.challenge!,
            p: null,
            k: null,
        });
        const signedIn = await secondStep(account(), done.challenge!, codeFor(replacement.secret!));
        expect(signedIn.outcome?.__typename).toBe('CurrentUser');
        expect(signedIn.token).toBeTruthy();
    }, 150_000);
});

describe('flows that core ends with a sign-in', () => {
    it('resetPassword changes the password but opens no session', async () => {
        const { customer } = accounts;
        const link = await tokenFromNewMail(
            stack.url,
            customer.username,
            'Forgotten password reset',
            () => stack.call('shop-api', RESET_REQUEST, { e: customer.username }),
        );
        const reset = await stack.call<{ resetPassword: { __typename: string } }>(
            'shop-api',
            RESET,
            {
                t: link,
                p: PASSWORD,
            },
        );
        expect(reset.data?.resetPassword.__typename).toBe('CurrentUser');
        expect(reset.token).toBeNull();
        expect((await passwordLogin(customer, LOGIN)).token).toBeNull();
    }, 150_000);

    it('acting-session routes need a signed-in manager, and a made-up ticket gives no session', async () => {
        const start = await stack.call(
            'admin-api',
            `mutation { startActingSession(counterpartyId: "1") { ticket } }`,
        );
        expect(start.errors.join()).toMatch(DENIED);
        const exchange = await stack.call(
            'shop-api',
            `mutation { exchangeActingTicket(ticket: "made-up") { token } }`,
        );
        expect(exchange.errors.length).toBeGreaterThan(0);
        expect(exchange.data?.exchangeActingTicket ?? null).toBeNull();
    });
});
