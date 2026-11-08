import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, User, UserService } from '@vendure/core';

import { FactorStoreService } from './factor-store.service';
import { encryptSecret } from './secret-cipher';
import { TokenStoreService } from './token-store.service';
import { TwoFactorAuditService } from './two-factor-audit.service';
import { TwoFactorChangedEvent, TwoFactorEnabledEvent } from './two-factor.events';
import { TwoFactorLockService } from './two-factor-lock.service';
import { TwoFactorVerificationService } from './two-factor-verification.service';
import {
    MAX_TOKEN_ATTEMPTS_DEFAULT,
    PENDING_TTL_DEFAULT_MS,
    TWO_FACTOR_PLUGIN_OPTIONS,
    twoFactorError,
} from './two-factor.types';
import type {
    TwoFactorEnrolmentResult,
    TwoFactorErrorResult,
    TwoFactorPluginOptions,
    TwoFactorStatusResult,
} from './two-factor.types';
import { SecondFactorMethodRegistry } from './totp/second-factor-method';

const METHOD = 'totp';
export type ActivationOutcome = 'ACTIVATED' | 'NO_PENDING' | 'EXPIRED' | 'INVALID_CODE';

@Injectable()
export class TwoFactorEnrolmentService {
    constructor(
        private factors: FactorStoreService,
        private tokens: TokenStoreService,
        private verification: TwoFactorVerificationService,
        private audit: TwoFactorAuditService,
        private locks: TwoFactorLockService,
        private users: UserService,
        private methods: SecondFactorMethodRegistry,
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    // A just-verified password is the proof: a sign-in challenge in the ENROL stage.
    async startForChallenge(
        ctx: RequestContext,
        challenge: string,
    ): Promise<TwoFactorEnrolmentResult | TwoFactorErrorResult> {
        const userId = await this.tokens.findUserId(ctx, challenge, 'sign-in');
        if (!userId) return twoFactorError('CHALLENGE_INVALID');
        return this.locks.withUser(ctx, userId, async txCtx => {
            const token = await this.tokens.findUsable(
                txCtx,
                challenge,
                'sign-in',
                this.options.maxTokenAttempts ?? MAX_TOKEN_ATTEMPTS_DEFAULT,
            );
            const stale = !token || token.stage !== 'ENROL' || token.apiType !== txCtx.apiType;
            // A password alone never replaces a factor that appeared after the challenge was issued.
            if (stale || (await this.factors.hasActive(txCtx, userId))) {
                return twoFactorError('CHALLENGE_INVALID');
            }
            return this.createPending(txCtx, userId);
        });
    }

    // A signed-in user must re-enter the password, and give a current code when replacing an active factor.
    async startForSession(
        ctx: RequestContext,
        userId: string,
        password: string | null | undefined,
        currentCode: string | null | undefined,
    ): Promise<TwoFactorEnrolmentResult | TwoFactorErrorResult> {
        return this.locks.withUser(ctx, userId, async txCtx => {
            if (!password || !(await this.verification.passwordMatches(txCtx, userId, password))) {
                return twoFactorError('PASSWORD_INVALID');
            }
            const active = await this.factors.find(txCtx, userId, 'active');
            if (active) {
                if (!currentCode) return twoFactorError('CODE_REQUIRED');
                if (!(await this.verification.verifyAndClaim(txCtx, active, currentCode))) {
                    return twoFactorError('INVALID_CODE');
                }
            }
            return this.createPending(txCtx, userId);
        });
    }

    // Replaces any earlier pending secret: there is one pending factor per account.
    private async createPending(
        ctx: RequestContext,
        userId: string,
    ): Promise<TwoFactorEnrolmentResult> {
        const user = await this.requireUser(ctx, userId);
        const method = this.methods.get(METHOD);
        const secret = method.createSecret();
        const uuid = this.factors.newUuid();
        const expiresAt = new Date(
            Date.now() + (this.options.pendingTtlMs ?? PENDING_TTL_DEFAULT_MS),
        );
        await this.factors.replacePending(ctx, {
            userId,
            uuid,
            method: METHOD,
            secretEncrypted: encryptSecret(secret, this.options.encryptionKey, uuid),
            expiresAt,
        });
        return {
            __typename: 'TwoFactorEnrolment',
            otpauthUri: method.enrolmentUri(secret, user.identifier, this.options.issuer),
            secret,
            expiresAt,
        };
    }

    async confirmForSession(
        ctx: RequestContext,
        userId: string,
        code: string,
    ): Promise<ActivationOutcome> {
        return this.locks.withUser(ctx, userId, txCtx => this.activate(txCtx, userId, code));
    }

    // Caller holds the user lock. A wrong code leaves the pending secret in place for another try until it expires.
    async activate(ctx: RequestContext, userId: string, code: string): Promise<ActivationOutcome> {
        const pending = await this.factors.find(ctx, userId, 'pending');
        if (!pending) return 'NO_PENDING';
        if (!pending.pendingExpiresAt || pending.pendingExpiresAt <= new Date()) return 'EXPIRED';
        const step = this.verification.matchStep(pending, code);
        if (step === null) return 'INVALID_CODE';
        const replaced = await this.factors.activatePending(ctx, userId, step);
        const user = await this.requireUser(ctx, userId);
        await (replaced
            ? this.audit.recordAndNotify(ctx, user, 'changed', new TwoFactorChangedEvent(ctx, user))
            : this.audit.recordAndNotify(
                  ctx,
                  user,
                  'enrolled',
                  new TwoFactorEnabledEvent(ctx, user),
              ));
        return 'ACTIVATED';
    }

    async status(ctx: RequestContext, userId: string): Promise<TwoFactorStatusResult> {
        const active = await this.factors.find(ctx, userId, 'active');
        const pending = await this.factors.find(ctx, userId, 'pending');
        return {
            __typename: 'TwoFactorStatus',
            required: this.options.required,
            enrolled: !!active,
            method: active?.method ?? null,
            activatedAt: active?.activatedAt ?? null,
            pendingEnrolment: !!pending?.pendingExpiresAt && pending.pendingExpiresAt > new Date(),
        };
    }

    private async requireUser(ctx: RequestContext, userId: string): Promise<User> {
        const user = await this.users.getUserById(ctx, userId);
        if (!user) throw new Error(`User ${userId} not found`);
        return user;
    }
}
