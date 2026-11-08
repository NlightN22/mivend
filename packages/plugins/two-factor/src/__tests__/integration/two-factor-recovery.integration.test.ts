import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashToken } from '../../token-hash';
import {
    Fixture,
    PASSWORD,
    adminCtx,
    codeAt,
    enrol,
    openFixture,
    shopCtx,
} from './two-factor-fixture';

let fx: Fixture;
const USER = '21';
const past = (): Date => new Date(Date.now() - 60_000);

beforeAll(async () => {
    fx = await openFixture('two_factor_recovery');
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

async function verifyChallenge(): Promise<string> {
    return (await fx.challenges.issue(shopCtx, USER, 'VERIFY')).challenge;
}

async function requestLink(): Promise<string> {
    await fx.dataSource.query(
        `UPDATE two_factor_token SET "createdAt" = now() - interval '2 minutes'`,
    );
    const result = await fx.recovery.request(shopCtx, await verifyChallenge());
    expect(result).toMatchObject({ __typename: 'TwoFactorRecoveryRequested' });
    const event = fx.events.filter(e => e.name === 'TwoFactorRecoveryRequestedEvent').pop();
    if (!event?.token) throw new Error('no recovery link was issued');
    return event.token;
}

const mailCount = (): number =>
    fx.events.filter(e => e.name === 'TwoFactorRecoveryRequestedEvent').length;

describe('recovery request by challenge', () => {
    it('sends the link and returns only a masked address', async () => {
        await enrol(fx, USER);
        const result = await fx.recovery.request(shopCtx, await verifyChallenge());
        expect(result).toEqual({
            __typename: 'TwoFactorRecoveryRequested',
            success: true,
            maskedEmailAddress: 'u***@example.org',
        });
        expect(mailCount()).toBe(1);
        expect(fx.audits).toContain('update:two-factor recovery-requested');
    });

    it('keeps the challenge usable for the sign-in and sends no second mail inside the window', async () => {
        const secret = await enrol(fx, USER);
        const challenge = await verifyChallenge();
        await fx.recovery.request(shopCtx, challenge);
        expect(await fx.recovery.request(shopCtx, challenge)).toMatchObject({
            __typename: 'TwoFactorRecoveryRequested',
            maskedEmailAddress: 'u***@example.org',
        });
        expect(await fx.recovery.request(shopCtx, await verifyChallenge())).toMatchObject({
            success: true,
        });
        expect(mailCount()).toBe(1);
        expect(
            await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1)),
        ).toMatchObject({
            id: USER,
        });
    });

    it('sends again once the window has passed', async () => {
        await enrol(fx, USER);
        await requestLink();
        await requestLink();
        expect(mailCount()).toBe(2);
    });

    it('answers a neutral failure and sends nothing for an unknown, expired, used, wrong-API or non-VERIFY challenge', async () => {
        await enrol(fx, USER);
        const expired = await verifyChallenge();
        await fx.dataSource.query('UPDATE two_factor_token SET "expiresAt" = $1', [past()]);
        const used = await verifyChallenge();
        await fx.dataSource.query(
            `UPDATE two_factor_token SET "usedAt" = now() WHERE "tokenHash" = $1`,
            [hashToken(used)],
        );
        const fresh = await verifyChallenge();
        const enrolStage = (await fx.challenges.issue(shopCtx, USER, 'ENROL')).challenge;
        for (const [ctx, challenge] of [
            [shopCtx, 'unknown-challenge'],
            [shopCtx, expired],
            [shopCtx, used],
            [adminCtx, fresh],
            [shopCtx, enrolStage],
        ] as const) {
            expect(await fx.recovery.request(ctx, challenge)).toMatchObject({
                failure: 'CHALLENGE_INVALID',
            });
        }
        expect(mailCount()).toBe(0);
    });

    it('refuses a recovery link as a challenge and an account without a factor', async () => {
        expect(await fx.recovery.request(shopCtx, await verifyChallenge())).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
        await enrol(fx, USER);
        const link = await requestLink();
        expect(await fx.recovery.request(shopCtx, link)).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });
});

describe('recovery link', () => {
    it('is stored hashed, and a newer link supersedes the older one', async () => {
        await enrol(fx, USER);
        const first = await requestLink();
        const second = await requestLink();
        const rows = await fx.dataSource.query(
            `SELECT "tokenHash" FROM two_factor_token WHERE purpose = 'recovery'`,
        );
        expect(rows.map((r: { tokenHash: string }) => r.tokenHash).sort()).toEqual(
            [hashToken(first), hashToken(second)].sort(),
        );
        expect(await fx.recovery.complete(shopCtx, first, PASSWORD)).toMatchObject({
            failure: 'RECOVERY_LINK_INVALID',
        });
        expect(await fx.recovery.complete(shopCtx, second, PASSWORD)).toMatchObject({
            stage: 'ENROL',
        });
    });

    it('needs the account password: a wrong one changes nothing and keeps the link alive', async () => {
        const secret = await enrol(fx, USER);
        const link = await requestLink();
        expect(await fx.recovery.complete(shopCtx, link, 'wrong')).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
        expect(await fx.factors.hasActive(shopCtx, USER)).toBe(true);
        expect(fx.revokedUsers).toEqual([]);
        const rows = await fx.dataSource.query(
            `SELECT attempts, "usedAt" FROM two_factor_token WHERE "tokenHash" = $1`,
            [hashToken(link)],
        );
        expect(rows[0]).toMatchObject({ attempts: 1, usedAt: null });
        const challenge = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(
            await fx.challenges.completeSignIn(shopCtx, challenge.challenge, codeAt(secret, 1)),
        ).toMatchObject({
            id: USER,
        });
    });

    it('stops accepting guesses after the attempt cap', async () => {
        await enrol(fx, USER);
        const link = await requestLink();
        for (let i = 0; i < fx.options.maxTokenAttempts!; i += 1) {
            await fx.recovery.complete(shopCtx, link, 'wrong');
        }
        expect(await fx.recovery.complete(shopCtx, link, PASSWORD)).toMatchObject({
            failure: 'RECOVERY_LINK_INVALID',
        });
    });

    it('refuses an expired link', async () => {
        await enrol(fx, USER);
        const link = await requestLink();
        await fx.dataSource.query('UPDATE two_factor_token SET "expiresAt" = $1', [past()]);
        expect(await fx.recovery.complete(shopCtx, link, PASSWORD)).toMatchObject({
            failure: 'RECOVERY_LINK_INVALID',
        });
    });

    it('is not a sign-in challenge', async () => {
        await enrol(fx, USER);
        const link = await requestLink();
        expect(await fx.enrolment.startForChallenge(shopCtx, link)).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });

    it('replaces the factor: old device and sessions end, an ENROL challenge comes back, the owner is told', async () => {
        const oldSecret = await enrol(fx, USER);
        const link = await requestLink();
        const done = await fx.recovery.complete(shopCtx, link, PASSWORD);
        if (done.__typename !== 'TwoFactorChallenge' || !done.challenge)
            throw new Error('no challenge');
        expect(done.stage).toBe('ENROL');
        expect(fx.revokedUsers).toEqual([USER]);
        expect(await fx.factors.hasActive(shopCtx, USER)).toBe(false);
        expect(fx.events.map(e => e.name)).toContain('TwoFactorRecoveryCompletedEvent');
        expect(fx.audits).toContain('deactivate:two-factor recovery-completed');
        expect(await fx.recovery.complete(shopCtx, link, PASSWORD)).toMatchObject({
            failure: 'RECOVERY_LINK_INVALID',
        });

        const started = await fx.enrolment.startForChallenge(shopCtx, done.challenge);
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        expect(started.secret).not.toBe(oldSecret);
        expect(
            await fx.challenges.completeSignIn(shopCtx, done.challenge, codeAt(started.secret)),
        ).toMatchObject({
            id: USER,
        });
        expect(fx.events.map(e => e.name)).toContain('TwoFactorEnabledEvent');
    });

    it('completes on the admin API for an administrator account', async () => {
        await enrol(fx, USER);
        const link = await requestLink();
        expect(await fx.recovery.complete(adminCtx, link, PASSWORD)).toMatchObject({
            stage: 'ENROL',
        });
    });
});

describe('concurrent writers', () => {
    it('lets exactly one of two parallel recovery completions through', async () => {
        await enrol(fx, USER);
        const link = await requestLink();
        const results = await Promise.all([
            fx.recovery.complete(shopCtx, link, PASSWORD),
            fx.recovery.complete(shopCtx, link, PASSWORD),
        ]);
        expect(results.filter(r => r.__typename === 'TwoFactorChallenge')).toHaveLength(1);
        expect(results.filter(r => r.__typename === 'TwoFactorError')).toHaveLength(1);
        expect(fx.revokedUsers).toEqual([USER]);
        expect(fx.events.filter(e => e.name === 'TwoFactorRecoveryCompletedEvent')).toHaveLength(1);
    });

    it('activates a pending secret once when two confirmations race', async () => {
        const started = await fx.enrolment.startForSession(shopCtx, USER, PASSWORD, null);
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        const code = codeAt(started.secret);
        const outcomes = await Promise.all([
            fx.enrolment.confirmForSession(shopCtx, USER, code),
            fx.enrolment.confirmForSession(shopCtx, USER, code),
        ]);
        expect(outcomes.sort()).toEqual(['ACTIVATED', 'NO_PENDING']);
        expect(
            await fx.dataSource.query(`SELECT 1 FROM two_factor_factor WHERE status = 'active'`),
        ).toHaveLength(1);
        expect(fx.audits.filter(a => a.startsWith('create'))).toHaveLength(1);
        expect(fx.events.filter(e => e.name === 'TwoFactorEnabledEvent')).toHaveLength(1);
    });

    it('keeps one pending factor when two enrolments start together', async () => {
        await Promise.all([
            fx.enrolment.startForSession(shopCtx, USER, PASSWORD, null),
            fx.enrolment.startForSession(shopCtx, USER, PASSWORD, null),
        ]);
        expect(
            await fx.dataSource.query(`SELECT 1 FROM two_factor_factor WHERE status = 'pending'`),
        ).toHaveLength(1);
    });
});

describe('enrolment and device change by a signed-in user', () => {
    it('needs the password to start', async () => {
        expect(await fx.enrolment.startForSession(shopCtx, USER, 'wrong', null)).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
        expect(await fx.enrolment.startForSession(shopCtx, USER, null, null)).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
        expect(await fx.dataSource.query('SELECT 1 FROM two_factor_factor')).toHaveLength(0);
    });

    it('needs the current code as well to change the device, and leaves the old factor until the new one is confirmed', async () => {
        const oldSecret = await enrol(fx, USER);
        expect(await fx.enrolment.startForSession(shopCtx, USER, PASSWORD, null)).toMatchObject({
            failure: 'CODE_REQUIRED',
        });
        expect(await fx.enrolment.startForSession(shopCtx, USER, PASSWORD, '000000')).toMatchObject(
            {
                failure: 'INVALID_CODE',
            },
        );
        const started = await fx.enrolment.startForSession(
            shopCtx,
            USER,
            PASSWORD,
            codeAt(oldSecret, 1),
        );
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        expect((await fx.factors.find(shopCtx, USER, 'active'))?.status).toBe('active');

        expect(await fx.enrolment.confirmForSession(shopCtx, USER, codeAt(started.secret))).toBe(
            'ACTIVATED',
        );
        const challenge = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(
            await fx.challenges.completeSignIn(shopCtx, challenge.challenge, codeAt(oldSecret, 2)),
        ).toBe('TWO_FACTOR_INVALID_CODE');
        expect(fx.audits).toContain('update:two-factor changed');
        expect(fx.events.map(e => e.name)).toContain('TwoFactorChangedEvent');
        expect(await fx.dataSource.query(`SELECT 1 FROM two_factor_factor`)).toHaveLength(1);
    });

    it('reports a wrong confirmation code without activating', async () => {
        const started = await fx.enrolment.startForSession(shopCtx, USER, PASSWORD, null);
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        const wrong = codeAt(started.secret) === '000000' ? '000001' : '000000';
        expect(await fx.enrolment.confirmForSession(shopCtx, USER, wrong)).toBe('INVALID_CODE');
        expect(await fx.factors.hasActive(shopCtx, USER)).toBe(false);
        expect((await fx.enrolment.status(shopCtx, USER)).pendingEnrolment).toBe(true);
    });
});
