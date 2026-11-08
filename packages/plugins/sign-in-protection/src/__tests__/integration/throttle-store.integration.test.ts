import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CaptchaService } from '../../captcha/captcha.service';
import type { PasswordBreachService } from '../../breach/password-breach.service';
import { SignInGuardService } from '../../sign-in-guard.service';
import { SignInThrottleService } from '../../sign-in-throttle.service';
import { ThrottleStoreService } from '../../throttle-store.service';
import type { SignInProtectionOptions } from '../../types';

const ctx = { apiType: 'shop', req: { headers: {}, ip: '10.0.0.1' } } as unknown as RequestContext;
const otherIp = {
    apiType: 'shop',
    req: { headers: {}, ip: '10.0.0.2' },
} as unknown as RequestContext;
const limits = { threshold: 3, baseLockMs: 60_000, maxLockMs: 600_000 };
const RESET_MS = 3_600_000;

const options: SignInProtectionOptions = {
    throttle: {
        enabled: true,
        perLogin: { ...limits, threshold: 6 },
        perLoginIp: limits,
        resetAfterMs: RESET_MS,
        trustedProxyHops: 2,
        cleanupPollIntervalMs: RESET_MS,
    },
    captcha: { provider: null, afterFailures: 3 },
    breach: { checker: null },
};

let dataSource: DataSource;
let schema: string;
let store: ThrottleStoreService;
let throttle: SignInThrottleService;
let guard: SignInGuardService;
let connection: TransactionalConnection;

beforeAll(async () => {
    const opts = testSchemaOptions('sign_in_throttle');
    schema = opts.schema;
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra: opts.extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE sign_in_throttle (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "key" varchar NOT NULL UNIQUE, failures int NOT NULL DEFAULT 0, "lastFailureAt" timestamptz NOT NULL)`);
    connection = createTestConnection(dataSource);
    store = new ThrottleStoreService(connection);
    throttle = new SignInThrottleService(store, options);
    guard = new SignInGuardService(throttle, new CaptchaService(throttle, options), {
        flagIfBreached: async () => undefined,
    } as unknown as PasswordBreachService);
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});
beforeEach(() => dataSource.query('TRUNCATE sign_in_throttle RESTART IDENTITY'));

describe('counter store', () => {
    it('counts every one of many concurrent failures (no lost update)', async () => {
        await Promise.all(
            Array.from({ length: 25 }, () => store.recordFailure(ctx, 'k', RESET_MS)),
        );
        const state = await store.read(ctx, ['k']);
        expect(state.get('k')?.failures).toBe(25);
        expect(await dataSource.query('SELECT 1 FROM sign_in_throttle')).toHaveLength(1);
    });

    it('restarts a counter whose last failure is older than the reset window', async () => {
        await store.recordFailure(ctx, 'k', RESET_MS);
        await dataSource.query(
            `UPDATE sign_in_throttle SET "lastFailureAt" = now() - interval '2 hours'`,
        );
        expect(await store.recordFailure(ctx, 'k', RESET_MS)).toBe(1);
    });

    it('measures age on the database clock and purges stale rows', async () => {
        await store.recordFailure(ctx, 'old', RESET_MS);
        await dataSource.query(
            `UPDATE sign_in_throttle SET "lastFailureAt" = now() - interval '2 hours'`,
        );
        await store.recordFailure(ctx, 'fresh', RESET_MS);
        expect(Number((await store.read(ctx, ['old'])).get('old')?.ageMs)).toBeGreaterThan(
            3_600_000,
        );
        expect(await store.deleteStale(ctx, RESET_MS)).toBe(1);
    });
});

describe('throttle service', () => {
    it('locks after the threshold, per login and IP, and is silent for other IPs', async () => {
        for (let i = 0; i < 3; i++)
            await throttle.recordFailure(ctx, 'password', 'User@Example.org');
        expect(await throttle.isLocked(ctx, 'password', 'user@example.org')).toBe(true);
        expect(await throttle.isLocked(otherIp, 'password', 'user@example.org')).toBe(false);
    });

    it('locks the login across IPs at the higher per-login threshold', async () => {
        for (let i = 0; i < 6; i++) {
            await throttle.recordFailure(i % 2 ? ctx : otherIp, 'password', 'victim');
        }
        const thirdIp = {
            apiType: 'shop',
            req: { headers: {}, ip: '10.0.0.3' },
        } as unknown as RequestContext;
        expect(await throttle.isLocked(thirdIp, 'password', 'victim')).toBe(true);
    });

    it('treats unknown and existing logins identically (same keys, same state)', async () => {
        for (let i = 0; i < 3; i++) {
            await throttle.recordFailure(ctx, 'password', 'no-such-login');
            await throttle.recordFailure(ctx, 'password', 'real-login');
        }
        expect(await throttle.isLocked(ctx, 'password', 'no-such-login')).toBe(
            await throttle.isLocked(ctx, 'password', 'real-login'),
        );
    });

    it('a success resets the counters', async () => {
        for (let i = 0; i < 3; i++) await throttle.recordFailure(ctx, 'password', 'a');
        await throttle.reset(ctx, 'password', 'a');
        expect(await throttle.isLocked(ctx, 'password', 'a')).toBe(false);
        expect(await throttle.failureCount(ctx, 'password', 'a')).toBe(0);
    });

    it('lets the lock lapse: it is temporary', async () => {
        for (let i = 0; i < 3; i++) await throttle.recordFailure(ctx, 'password', 'a');
        await dataSource.query(
            `UPDATE sign_in_throttle SET "lastFailureAt" = now() - interval '5 minutes'`,
        );
        expect(await throttle.isLocked(ctx, 'password', 'a')).toBe(false);
    });

    it('keeps scopes apart and does nothing when disabled', async () => {
        for (let i = 0; i < 3; i++) await throttle.recordFailure(ctx, 'password', 'a');
        expect(await throttle.isLocked(ctx, 'second-step', 'a')).toBe(false);
        const off = new SignInThrottleService(store, {
            ...options,
            throttle: { ...options.throttle, enabled: false },
        });
        await off.recordFailure(ctx, 'password', 'b');
        expect(
            await dataSource.query(
                `SELECT 1 FROM sign_in_throttle WHERE failures > 0 AND "key" LIKE 'password:%'`,
            ),
        ).toHaveLength(2);
        expect(await off.isLocked(ctx, 'password', 'a')).toBe(false);
    });
});

// One login attempt as the password step runs it: admit, verify (slow), then record, all in one transaction.
async function attempt(
    correct: boolean,
    verified: { count: number },
    from: RequestContext = ctx,
): Promise<boolean> {
    return connection.withTransaction(ctx, async tx => {
        const txCtx = Object.assign(tx, { req: from.req }) as unknown as RequestContext;
        if (!(await guard.admit(txCtx, 'victim'))) return false;
        verified.count++;
        await new Promise(done => setTimeout(done, 25));
        if (correct) {
            await guard.recordSuccess(txCtx, 'victim', { id: 1 } as never, 'pw');
            return true;
        }
        await guard.recordFailure(txCtx, 'victim');
        return false;
    });
}

describe('concurrent password attempts (check-then-act)', () => {
    it('lets at most the threshold of parallel wrong guesses reach the password check, the rest are refused at once', async () => {
        const verified = { count: 0 };
        await Promise.all(Array.from({ length: 12 }, () => attempt(false, verified)));
        expect(verified.count).toBeGreaterThanOrEqual(1);
        expect(verified.count).toBeLessThanOrEqual(limits.threshold);
        expect(await throttle.failureCount(ctx, 'password', 'victim')).toBeLessThanOrEqual(
            limits.threshold,
        );
    });

    it('serialises only the attacker address: the same login from another address is never refused as busy', async () => {
        const verified = { count: 0 };
        await Promise.all([
            ...Array.from({ length: 6 }, () => attempt(false, verified)),
            attempt(true, verified, otherIp),
        ]);
        expect(await throttle.failureCount(otherIp, 'password', 'victim')).toBe(0);
        expect(verified.count).toBeGreaterThanOrEqual(2);
    });

    it('a parallel correct and wrong mix never leaves the login locked for good', async () => {
        const verified = { count: 0 };
        const results = await Promise.all([
            ...Array.from({ length: 6 }, () => attempt(false, verified)),
            attempt(true, verified),
        ]);
        expect(verified.count).toBeLessThanOrEqual(limits.threshold + 4);
        expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
        await dataSource.query(
            `UPDATE sign_in_throttle SET "lastFailureAt" = now() - interval '2 hours'`,
        );
        const after = { count: 0 };
        expect(await attempt(true, after)).toBe(true);
        expect(await throttle.isLocked(ctx, 'password', 'victim')).toBe(false);
    });
});
