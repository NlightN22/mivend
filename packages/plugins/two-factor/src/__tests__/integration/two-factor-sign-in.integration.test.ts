import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashToken } from '../../token-hash';
import { Fixture, adminCtx, codeAt, enrol, openFixture, shopCtx } from './two-factor-fixture';

let fx: Fixture;
const USER = '11';

beforeAll(async () => {
    fx = await openFixture('two_factor_sign_in');
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

async function tokenRow(token: string): Promise<{ attempts: number; usedAt: Date | null }> {
    const rows = await fx.dataSource.query(
        `SELECT attempts, "usedAt" FROM two_factor_token WHERE "tokenHash" = $1`,
        [hashToken(token)],
    );
    return rows[0];
}

describe('sign-in challenge storage and lifecycle', () => {
    it('stores only the hash of the challenge', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const rows = await fx.dataSource.query('SELECT "tokenHash" FROM two_factor_token');
        expect(rows).toEqual([{ tokenHash: hashToken(challenge) }]);
        expect(JSON.stringify(rows)).not.toContain(challenge);
    });

    it('opens the second step only with a valid code, once', async () => {
        const secret = await enrol(fx, USER);
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const code = codeAt(secret, 1);
        const user = await fx.challenges.completeSignIn(shopCtx, challenge, code);
        expect(user).toMatchObject({ id: USER });
        expect((await tokenRow(challenge)).usedAt).not.toBeNull();
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1))).toBe(
            'TWO_FACTOR_CHALLENGE_INVALID',
        );
    });

    it('gives no user for a wrong code and counts the attempt', async () => {
        const secret = await enrol(fx, USER);
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const wrong = codeAt(secret, 1) === '000000' ? '000001' : '000000';
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, wrong)).toBe(
            'TWO_FACTOR_INVALID_CODE',
        );
        expect((await tokenRow(challenge)).attempts).toBe(1);
        expect((await tokenRow(challenge)).usedAt).toBeNull();
    });

    it('dies after the attempt cap even for the right code', async () => {
        const secret = await enrol(fx, USER);
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        for (let i = 0; i < fx.options.maxTokenAttempts!; i += 1) {
            await fx.challenges.completeSignIn(shopCtx, challenge, '12345a');
            await fx.challenges.completeSignIn(shopCtx, challenge, 'abcdef');
        }
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1))).toBe(
            'TWO_FACTOR_CHALLENGE_INVALID',
        );
    });

    it('refuses an expired challenge, an unknown one and one issued for the other API', async () => {
        const secret = await enrol(fx, USER);
        const expired = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        await fx.dataSource.query(
            `UPDATE two_factor_token SET "expiresAt" = now() - interval '1 minute'`,
        );
        expect(
            await fx.challenges.completeSignIn(shopCtx, expired.challenge, codeAt(secret, 1)),
        ).toBe('TWO_FACTOR_CHALLENGE_INVALID');
        expect(
            await fx.challenges.completeSignIn(shopCtx, 'not-a-challenge', codeAt(secret, 1)),
        ).toBe('TWO_FACTOR_CHALLENGE_INVALID');
        const forShop = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(
            await fx.challenges.completeSignIn(adminCtx, forShop.challenge, codeAt(secret, 1)),
        ).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    });

    it('does not accept a recovery link as a sign-in challenge', async () => {
        const secret = await enrol(fx, USER);
        const { token } = await fx.tokens.issue(shopCtx, {
            userId: USER,
            purpose: 'recovery',
            ttlMs: 60_000,
        });
        expect(await fx.challenges.completeSignIn(shopCtx, token, codeAt(secret, 1))).toBe(
            'TWO_FACTOR_CHALLENGE_INVALID',
        );
    });
});

describe('replay and concurrency of the code', () => {
    it('rejects the code that activated the factor and everything at or before its step', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'ENROL');
        const started = await fx.enrolment.startForChallenge(shopCtx, challenge);
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        const used = codeAt(started.secret);
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, used)).toMatchObject({
            id: USER,
        });
        const next = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(await fx.challenges.completeSignIn(shopCtx, next.challenge, used)).toBe(
            'TWO_FACTOR_INVALID_CODE',
        );
        expect(
            await fx.challenges.completeSignIn(shopCtx, next.challenge, codeAt(started.secret, -1)),
        ).toBe('TWO_FACTOR_INVALID_CODE');
    });

    it('lets exactly one of two parallel sign-ins with the same code through', async () => {
        const secret = await enrol(fx, USER);
        const first = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const second = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const code = codeAt(secret, 1);
        const results = await Promise.all([
            fx.challenges.completeSignIn(shopCtx, first.challenge, code),
            fx.challenges.completeSignIn(shopCtx, second.challenge, code),
        ]);
        expect(results.filter(r => typeof r === 'object')).toHaveLength(1);
        expect(results.filter(r => r === 'TWO_FACTOR_INVALID_CODE')).toHaveLength(1);
    });

    it('lets exactly one of two parallel uses of one challenge through', async () => {
        const secret = await enrol(fx, USER);
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        const results = await Promise.all([
            fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1)),
            fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1)),
        ]);
        expect(results.filter(r => typeof r === 'object')).toHaveLength(1);
    });

    it('claims a step once and never moves it backwards', async () => {
        await enrol(fx, USER);
        const factor = (await fx.factors.find(shopCtx, USER, 'active'))!;
        const step = (factor.lastUsedStep ?? 0) + 5;
        const claims = await Promise.all(
            Array.from({ length: 6 }, () => fx.factors.claimStep(shopCtx, factor.id, step)),
        );
        expect(claims.filter(Boolean)).toHaveLength(1);
        expect(await fx.factors.claimStep(shopCtx, factor.id, step - 1)).toBe(false);
    });
});

describe('enrolment through a challenge', () => {
    it('enrols once, audits it and announces it', async () => {
        await enrol(fx, USER);
        expect(await fx.factors.hasActive(shopCtx, USER)).toBe(true);
        expect(fx.audits).toEqual(['create:two-factor enrolled']);
        expect(fx.events.map(e => e.name)).toEqual(['TwoFactorEnabledEvent']);
    });

    it('keeps the secret encrypted in the row', async () => {
        const secret = await enrol(fx, USER);
        const rows = await fx.dataSource.query('SELECT "secretEncrypted" FROM two_factor_factor');
        expect(rows[0].secretEncrypted).not.toContain(secret);
        expect(rows[0].secretEncrypted.startsWith('v1.')).toBe(true);
    });

    it('rejects an ENROL challenge once a factor exists, so a password alone cannot replace it', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'ENROL');
        await enrol(fx, USER);
        expect(await fx.enrolment.startForChallenge(shopCtx, challenge)).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });

    it('gives a challenge in the ENROL stage no way to start enrolment from the VERIFY stage', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(await fx.enrolment.startForChallenge(shopCtx, challenge)).toMatchObject({
            failure: 'CHALLENGE_INVALID',
        });
    });

    it('restarts a pending secret on every start and keeps one pending row', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'ENROL');
        const first = await fx.enrolment.startForChallenge(shopCtx, challenge);
        const second = await fx.enrolment.startForChallenge(shopCtx, challenge);
        if (
            first.__typename !== 'TwoFactorEnrolment' ||
            second.__typename !== 'TwoFactorEnrolment'
        ) {
            throw new Error('no enrolment');
        }
        expect(second.secret).not.toBe(first.secret);
        expect(
            await fx.dataSource.query(`SELECT 1 FROM two_factor_factor WHERE status = 'pending'`),
        ).toHaveLength(1);
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(first.secret))).toBe(
            'TWO_FACTOR_INVALID_CODE',
        );
    });

    it('refuses to activate an expired pending secret', async () => {
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'ENROL');
        const started = await fx.enrolment.startForChallenge(shopCtx, challenge);
        if (started.__typename !== 'TwoFactorEnrolment') throw new Error('no enrolment');
        await fx.dataSource.query(
            `UPDATE two_factor_factor SET "pendingExpiresAt" = now() - interval '1 minute'`,
        );
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(started.secret))).toBe(
            'TWO_FACTOR_ENROLMENT_EXPIRED',
        );
        expect(await fx.factors.hasActive(shopCtx, USER)).toBe(false);
    });
});

describe('policy', () => {
    it('asks to enrol when required and nothing is enrolled, to verify once enrolled', async () => {
        expect(await fx.policy.stageFor(shopCtx, USER)).toBe('ENROL');
        await enrol(fx, USER);
        expect(await fx.policy.stageFor(shopCtx, USER)).toBe('VERIFY');
        expect(await fx.policy.stageFor(shopCtx, '12')).toBe('ENROL');
    });

    it('needs no second step where the obligation is off, until the user enrols', async () => {
        const off = await openFixture('two_factor_policy_off', false);
        try {
            expect(await off.policy.stageFor(shopCtx, USER)).toBe('NONE');
            expect(await off.policy.isEnforced(shopCtx, USER)).toBe(false);
            await enrol(off, USER);
            expect(await off.policy.isEnforced(shopCtx, USER)).toBe(true);
        } finally {
            await off.close();
        }
    });
});
