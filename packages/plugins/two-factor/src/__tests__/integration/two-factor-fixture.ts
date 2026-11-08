import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { AuthService, RequestContext, SessionService, UserService } from '@vendure/core';
import type { ConfigService, EventBus } from '@vendure/core';
import type { AdministratorService, TransactionalConnection, User } from '@vendure/core';
import type { VersioningService } from '@mivend/plugin-versioning';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import {
    SignInThrottleService,
    ThrottleStoreService,
    type SignInProtectionOptions,
} from '@mivend/plugin-sign-in-protection';

import { FactorStoreService } from '../../factor-store.service';
import { TokenStoreService } from '../../token-store.service';
import { TwoFactorAuditService } from '../../two-factor-audit.service';
import { TwoFactorChallengeService } from '../../two-factor-challenge.service';
import { TwoFactorEnrolmentService } from '../../two-factor-enrolment.service';
import { TwoFactorLockService } from '../../two-factor-lock.service';
import type { TwoFactorNativeAuthenticationStrategy } from '../../two-factor-native.strategy';
import { TwoFactorPolicyService } from '../../two-factor-policy.service';
import { TwoFactorRecoveryService } from '../../two-factor-recovery.service';
import { TwoFactorVerificationService } from '../../two-factor-verification.service';
import type { TwoFactorPluginOptions } from '../../two-factor.types';
import { base32Decode } from '../../totp/base32';
import { SecondFactorMethodRegistry } from '../../totp/second-factor-method';
import { totpMethod } from '../../totp/totp-method';
import { hotp, timeStep } from '../../totp/totp';

export const PASSWORD = 'correct-password';

const DDL = `
    CREATE TABLE two_factor_factor (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "userId" varchar NOT NULL, method varchar NOT NULL DEFAULT 'totp',
        status varchar NOT NULL, "secretEncrypted" text NOT NULL, "lastUsedStep" bigint,
        "pendingExpiresAt" timestamptz, "activatedAt" timestamptz);
    CREATE UNIQUE INDEX two_factor_active_user ON two_factor_factor ("userId") WHERE status = 'active';
    CREATE UNIQUE INDEX two_factor_pending_user ON two_factor_factor ("userId") WHERE status = 'pending';
    CREATE TABLE two_factor_token (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "tokenHash" varchar NOT NULL UNIQUE, purpose varchar NOT NULL, "userId" varchar NOT NULL,
        stage varchar, "apiType" varchar, "expiresAt" timestamptz NOT NULL, "usedAt" timestamptz, attempts int NOT NULL DEFAULT 0);
    CREATE TABLE sign_in_throttle (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "key" varchar NOT NULL UNIQUE, failures int NOT NULL DEFAULT 0, "lastFailureAt" timestamptz NOT NULL);
`;

const LIMITS = { threshold: 3, baseLockMs: 60_000, maxLockMs: 600_000 };

export function throttleOptions(enabled: boolean): SignInProtectionOptions {
    return {
        throttle: {
            enabled,
            perLogin: LIMITS,
            perLoginIp: LIMITS,
            resetAfterMs: 3_600_000,
            trustedProxyHops: 2,
            cleanupPollIntervalMs: 3_600_000,
        },
        captcha: { provider: null, afterFailures: 3 },
        breach: { checker: null },
    };
}

export interface Fixture {
    dataSource: DataSource;
    connection: TransactionalConnection;
    options: TwoFactorPluginOptions;
    factors: FactorStoreService;
    tokens: TokenStoreService;
    policy: TwoFactorPolicyService;
    throttle: SignInThrottleService;
    enrolment: TwoFactorEnrolmentService;
    challenges: TwoFactorChallengeService;
    recovery: TwoFactorRecoveryService;
    audits: string[];
    events: Array<{ name: string; token?: string }>;
    revokedUsers: string[];
    reset(): Promise<void>;
    close(): Promise<void>;
}

export const shopCtx = { apiType: 'shop' } as RequestContext;
export const adminCtx = { apiType: 'admin' } as RequestContext;

export function codeAt(secretBase32: string, stepOffset = 0): string {
    return hotp(base32Decode(secretBase32), timeStep(Date.now()) + stepOffset);
}

// The test connection hands work a bare transaction context; Vendure's copy keeps apiType, so this does too.
function withApiType(base: TransactionalConnection): TransactionalConnection {
    return {
        ...base,
        getRepository: base.getRepository,
        withTransaction: (ctx: RequestContext, work: (c: RequestContext) => Promise<unknown>) =>
            (base.withTransaction as (c: unknown, w: unknown) => Promise<unknown>)(
                ctx,
                (tx: object) => work(Object.assign(tx, { apiType: ctx.apiType }) as RequestContext),
            ),
    } as unknown as TransactionalConnection;
}

export async function openFixture(
    tag: string,
    required = true,
    throttle = false,
): Promise<Fixture> {
    const { schema, extra } = testSchemaOptions(tag);
    await createTestSchema(schema);
    const dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(DDL);
    const connection = withApiType(createTestConnection(dataSource));
    const options: TwoFactorPluginOptions = {
        required,
        encryptionKey: randomBytes(32),
        issuer: 'Site A',
        maxTokenAttempts: 5,
    };
    const audits: string[] = [];
    const events: Fixture['events'] = [];
    const revokedUsers: string[] = [];
    const versioning = {
        recordChange: async (_c: unknown, input: { comment?: string; action: string }) => {
            audits.push(`${input.action}:${input.comment}`);
        },
    } as unknown as VersioningService;
    const eventBus = {
        publish: async (event: { constructor: { name: string }; token?: string }) => {
            events.push({ name: event.constructor.name, token: event.token });
        },
    } as unknown as EventBus;
    const authService = {
        verifyUserPassword: async (_c: unknown, _id: unknown, password: string) =>
            password === PASSWORD ? true : { errorCode: 'INVALID_CREDENTIALS_ERROR' },
    } as unknown as AuthService;
    const users = {
        getUserById: async (_c: unknown, id: string) => ({
            id,
            identifier: `user-${id}@example.org`,
        }),
    } as unknown as UserService;
    const sessions = {
        deleteSessionsByUser: async (_c: unknown, user: User) => {
            revokedUsers.push(String(user.id));
        },
    } as unknown as SessionService;
    const administrators = {
        findOneByUserId: async () => ({ id: 1 }),
    } as unknown as AdministratorService;
    const configService = {
        authOptions: { requireVerification: false },
    } as unknown as ConfigService;

    const methods = new SecondFactorMethodRegistry([totpMethod]);
    const factors = new FactorStoreService(connection);
    const tokens = new TokenStoreService(connection);
    const locks = new TwoFactorLockService(connection);
    const audit = new TwoFactorAuditService(versioning, eventBus);
    const policy = new TwoFactorPolicyService(factors, options);
    const throttleService = new SignInThrottleService(
        new ThrottleStoreService(connection),
        throttleOptions(throttle),
    );
    const verification = new TwoFactorVerificationService(
        factors,
        authService,
        methods,
        throttleService,
        options,
    );
    const enrolment = new TwoFactorEnrolmentService(
        factors,
        tokens,
        verification,
        audit,
        locks,
        users,
        methods,
        options,
    );
    const challenges = new TwoFactorChallengeService(
        {} as TwoFactorNativeAuthenticationStrategy,
        policy,
        factors,
        tokens,
        enrolment,
        verification,
        locks,
        users,
        administrators,
        throttleService,
        configService,
        options,
    );
    const recovery = new TwoFactorRecoveryService(
        factors,
        tokens,
        audit,
        challenges,
        locks,
        verification,
        users,
        sessions,
        throttleService,
        options,
    );
    return {
        dataSource,
        connection,
        options,
        factors,
        tokens,
        policy,
        throttle: throttleService,
        enrolment,
        challenges,
        recovery,
        audits,
        events,
        revokedUsers,
        reset: async () => {
            await dataSource.query(
                'TRUNCATE two_factor_factor, two_factor_token, sign_in_throttle RESTART IDENTITY',
            );
            audits.length = 0;
            events.length = 0;
            revokedUsers.length = 0;
        },
        close: async () => {
            await dataSource.destroy();
            await dropTestSchema(schema);
        },
    };
}

// Enrols the user through the ENROL challenge path and returns the base32 secret.
export async function enrol(fx: Fixture, userId: string): Promise<string> {
    const { challenge } = await fx.challenges.issue(shopCtx, userId, 'ENROL');
    const started = await fx.enrolment.startForChallenge(shopCtx, challenge);
    if (started.__typename !== 'TwoFactorEnrolment') throw new Error('enrolment did not start');
    const signedIn = await fx.challenges.completeSignIn(shopCtx, challenge, codeAt(started.secret));
    if (typeof signedIn === 'string' || !signedIn) throw new Error(`enrolment failed: ${signedIn}`);
    return started.secret;
}
