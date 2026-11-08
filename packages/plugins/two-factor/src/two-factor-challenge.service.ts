import { Inject, Injectable } from '@nestjs/common';
import {
    AdministratorService,
    ConfigService,
    RequestContext,
    User,
    UserService,
} from '@vendure/core';
import { SignInThrottleService } from '@mivend/plugin-sign-in-protection';

import { FactorStoreService } from './factor-store.service';
import { TokenStoreService } from './token-store.service';
import { TwoFactorEnrolmentService } from './two-factor-enrolment.service';
import { TwoFactorLockService } from './two-factor-lock.service';
import { TwoFactorNativeAuthenticationStrategy } from './two-factor-native.strategy';
import { TwoFactorPolicyService } from './two-factor-policy.service';
import { TwoFactorVerificationService } from './two-factor-verification.service';
import {
    CHALLENGE_TTL_DEFAULT_MS,
    MAX_TOKEN_ATTEMPTS_DEFAULT,
    PENDING_TTL_DEFAULT_MS,
    TWO_FACTOR_PLUGIN_OPTIONS,
    twoFactorError,
} from './two-factor.types';
import type {
    TwoFactorApi,
    TwoFactorChallengeResult,
    TwoFactorErrorResult,
    TwoFactorPluginOptions,
} from './two-factor.types';

export const CHALLENGE_INVALID_ERROR = 'TWO_FACTOR_CHALLENGE_INVALID';
export const INVALID_CODE_ERROR = 'TWO_FACTOR_INVALID_CODE';
export const ENROLMENT_EXPIRED_ERROR = 'TWO_FACTOR_ENROLMENT_EXPIRED';

@Injectable()
export class TwoFactorChallengeService {
    constructor(
        private native: TwoFactorNativeAuthenticationStrategy,
        private policy: TwoFactorPolicyService,
        private factors: FactorStoreService,
        private tokens: TokenStoreService,
        private enrolment: TwoFactorEnrolmentService,
        private verification: TwoFactorVerificationService,
        private locks: TwoFactorLockService,
        private users: UserService,
        private administrators: AdministratorService,
        private throttle: SignInThrottleService,
        private configService: ConfigService,
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    // Step one: the password only. Never creates a session; a challenge is the only thing handed out.
    async start(
        ctx: RequestContext,
        username: string,
        password: string,
    ): Promise<TwoFactorChallengeResult | TwoFactorErrorResult> {
        const user = await this.native.verifyCredentials(ctx, { username, password });
        if (!user || !(await this.mayUseApi(ctx, user)))
            return twoFactorError('INVALID_CREDENTIALS');
        const userId = String(user.id);
        const stage = await this.policy.stageFor(ctx, userId);
        if (stage === 'NONE') {
            return { __typename: 'TwoFactorChallenge', stage, challenge: null, expiresAt: null };
        }
        const issued = await this.locks.withUser(ctx, userId, txCtx =>
            this.issue(txCtx, userId, stage),
        );
        return { __typename: 'TwoFactorChallenge', stage, ...issued };
    }

    issue(
        ctx: RequestContext,
        userId: string,
        stage: 'VERIFY' | 'ENROL',
    ): Promise<{ challenge: string; expiresAt: Date }> {
        return this.tokens
            .issue(ctx, {
                userId,
                purpose: 'sign-in',
                stage,
                apiType: ctx.apiType as TwoFactorApi,
                ttlMs:
                    stage === 'ENROL'
                        ? (this.options.pendingTtlMs ?? PENDING_TTL_DEFAULT_MS)
                        : (this.options.challengeTtlMs ?? CHALLENGE_TTL_DEFAULT_MS),
            })
            .then(({ token, expiresAt }) => ({ challenge: token, expiresAt }));
    }

    // Step two (strategy 'twoFactor'): a string result becomes InvalidCredentialsError, so no session exists on failure.
    async completeSignIn(
        ctx: RequestContext,
        challenge: string,
        code: string,
    ): Promise<User | false | string> {
        const userId = await this.tokens.findUserId(ctx, challenge, 'sign-in');
        if (!userId) return CHALLENGE_INVALID_ERROR;
        return this.locks.withUser(ctx, userId, async txCtx => {
            const token = await this.tokens.findUsable(
                txCtx,
                challenge,
                'sign-in',
                this.options.maxTokenAttempts ?? MAX_TOKEN_ATTEMPTS_DEFAULT,
            );
            if (!token || token.apiType !== txCtx.apiType) return CHALLENGE_INVALID_ERROR;
            const failure =
                token.stage === 'ENROL'
                    ? await this.checkEnrolStep(txCtx, userId, code)
                    : await this.checkVerifyStep(txCtx, userId, code);
            if (failure === INVALID_CODE_ERROR) {
                await this.tokens.recordFailure(txCtx, token.id);
            }
            if (failure) return failure;
            if (!(await this.tokens.claim(txCtx, token.id))) return CHALLENGE_INVALID_ERROR;
            return (await this.users.getUserById(txCtx, userId)) ?? CHALLENGE_INVALID_ERROR;
        });
    }

    private async checkVerifyStep(
        ctx: RequestContext,
        userId: string,
        code: string,
    ): Promise<string | null> {
        const factor = await this.factors.find(ctx, userId, 'active');
        if (!factor) return CHALLENGE_INVALID_ERROR;
        return (await this.verification.verifyAndClaim(ctx, factor, code))
            ? null
            : INVALID_CODE_ERROR;
    }

    private async checkEnrolStep(
        ctx: RequestContext,
        userId: string,
        code: string,
    ): Promise<string | null> {
        if (await this.factors.hasActive(ctx, userId)) return CHALLENGE_INVALID_ERROR;
        if (await this.throttle.isLocked(ctx, 'second-step', userId)) return INVALID_CODE_ERROR;
        const outcome = await this.enrolment.activate(ctx, userId, code);
        if (outcome === 'ACTIVATED') {
            await this.throttle.reset(ctx, 'second-step', userId);
            return null;
        }
        if (outcome !== 'INVALID_CODE') return ENROLMENT_EXPIRED_ERROR;
        await this.throttle.recordFailure(ctx, 'second-step', userId);
        return INVALID_CODE_ERROR;
    }

    // Mirrors what core enforces after authenticating: an administrator login needs an Administrator, and unverified accounts stay out.
    async mayUseApi(ctx: RequestContext, user: User): Promise<boolean> {
        if (this.configService.authOptions.requireVerification && !user.verified) return false;
        if (ctx.apiType !== 'admin') return true;
        return !!(await this.administrators.findOneByUserId(ctx, user.id));
    }
}
