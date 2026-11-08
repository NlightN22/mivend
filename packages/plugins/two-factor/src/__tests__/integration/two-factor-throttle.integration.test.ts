import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Fixture, codeAt, enrol, openFixture, shopCtx } from './two-factor-fixture';

let fx: Fixture;
const USER = '21';

beforeAll(async () => {
    fx = await openFixture('two_factor_throttle', true, true);
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

async function wrongGuess(): Promise<unknown> {
    const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
    return fx.challenges.completeSignIn(shopCtx, challenge, '000000');
}

describe('second-step throttling spans challenges', () => {
    it('locks the account after repeated wrong codes, even on fresh challenges, and refuses the right code', async () => {
        const secret = await enrol(fx, USER);
        for (let i = 0; i < 3; i++) {
            expect(await wrongGuess()).toBe('TWO_FACTOR_INVALID_CODE');
        }
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1))).toBe(
            'TWO_FACTOR_INVALID_CODE',
        );
    });

    it('a right code before the threshold signs in and clears the counter', async () => {
        const secret = await enrol(fx, USER);
        await wrongGuess();
        await wrongGuess();
        const { challenge } = await fx.challenges.issue(shopCtx, USER, 'VERIFY');
        expect(
            await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(secret, 1)),
        ).toMatchObject({
            id: USER,
        });
        expect(await fx.throttle.failureCount(shopCtx, 'second-step', USER)).toBe(0);
    });
});

describe('password re-check throttling', () => {
    it('locks recovery completion after repeated wrong passwords', async () => {
        await enrol(fx, USER);
        for (let i = 0; i < 3; i++) {
            const { token } = await fx.tokens.issue(shopCtx, {
                userId: USER,
                purpose: 'recovery',
                ttlMs: 60_000,
            });
            expect(await fx.recovery.complete(shopCtx, token, 'wrong')).toMatchObject({
                failure: 'PASSWORD_INVALID',
            });
        }
        const { token } = await fx.tokens.issue(shopCtx, {
            userId: USER,
            purpose: 'recovery',
            ttlMs: 60_000,
        });
        expect(await fx.recovery.complete(shopCtx, token, 'correct-password')).toMatchObject({
            failure: 'PASSWORD_INVALID',
        });
    });
});
