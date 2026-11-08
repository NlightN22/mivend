import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, SessionService, UserService } from '@vendure/core';
import { SignInThrottleService } from '@mivend/plugin-sign-in-protection';

import { maskEmailAddress } from './mask-email-address';
import { FactorStoreService } from './factor-store.service';
import { TokenStoreService } from './token-store.service';
import { TwoFactorAuditService } from './two-factor-audit.service';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { TwoFactorLockService } from './two-factor-lock.service';
import { TwoFactorVerificationService } from './two-factor-verification.service';
import {
    TwoFactorRecoveryCompletedEvent,
    TwoFactorRecoveryRequestedEvent,
} from './two-factor.events';
import {
    MAX_TOKEN_ATTEMPTS_DEFAULT,
    RECOVERY_REQUEST_INTERVAL_DEFAULT_MS,
    RECOVERY_TTL_DEFAULT_MS,
    TWO_FACTOR_PLUGIN_OPTIONS,
    twoFactorError,
} from './two-factor.types';
import type {
    TwoFactorChallengeResult,
    TwoFactorErrorResult,
    TwoFactorPluginOptions,
    TwoFactorRecoveryRequestedResult,
} from './two-factor.types';

// Lost device: an emailed single-use link plus the account password. Extension point for a cooling-off delay:
// hold the completion until a stored "not before" time here (not built, see docs/two-factor.md).
@Injectable()
export class TwoFactorRecoveryService {
    constructor(
        private factors: FactorStoreService,
        private tokens: TokenStoreService,
        private audit: TwoFactorAuditService,
        private challenges: TwoFactorChallengeService,
        private locks: TwoFactorLockService,
        private verification: TwoFactorVerificationService,
        private users: UserService,
        private sessions: SessionService,
        private throttle: SignInThrottleService,
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    // The sign-in challenge (password already proven) names the account; the address is never taken from the caller.
    async request(
        ctx: RequestContext,
        challenge: string,
    ): Promise<TwoFactorRecoveryRequestedResult | TwoFactorErrorResult> {
        const userId = await this.tokens.findUserId(ctx, challenge, 'sign-in');
        if (!userId) return twoFactorError('CHALLENGE_INVALID');
        return this.locks.withUser(ctx, userId, async txCtx => {
            const row = await this.tokens.findUsable(
                txCtx,
                challenge,
                'sign-in',
                this.options.maxTokenAttempts ?? MAX_TOKEN_ATTEMPTS_DEFAULT,
            );
            if (!row || row.stage !== 'VERIFY' || row.apiType !== txCtx.apiType) {
                return twoFactorError('CHALLENGE_INVALID');
            }
            const user = await this.users.getUserById(txCtx, userId);
            if (
                !user ||
                !(await this.challenges.mayUseApi(txCtx, user)) ||
                !(await this.factors.hasActive(txCtx, userId))
            ) {
                return twoFactorError('CHALLENGE_INVALID');
            }
            const result: TwoFactorRecoveryRequestedResult = {
                __typename: 'TwoFactorRecoveryRequested',
                success: true,
                maskedEmailAddress: maskEmailAddress(user.identifier),
            };
            // A newer request never voids an open link, so a password holder cannot keep killing the owner's link.
            const interval =
                this.options.recoveryRequestIntervalMs ?? RECOVERY_REQUEST_INTERVAL_DEFAULT_MS;
            if (await this.tokens.hasRecentRecovery(txCtx, userId, interval)) return result;
            if (await this.throttle.isLocked(txCtx, 'recovery-request', userId)) return result;
            await this.throttle.recordFailure(txCtx, 'recovery-request', userId);
            const { token } = await this.tokens.issue(txCtx, {
                userId,
                purpose: 'recovery',
                ttlMs: this.options.recoveryTtlMs ?? RECOVERY_TTL_DEFAULT_MS,
            });
            await this.audit.recordAndNotify(
                txCtx,
                user,
                'recovery-requested',
                new TwoFactorRecoveryRequestedEvent(txCtx, user, token),
            );
            return result;
        });
    }

    // Link plus password. The old factor and every session of the account end here; the result is an ENROL challenge.
    async complete(
        ctx: RequestContext,
        token: string,
        password: string,
    ): Promise<TwoFactorChallengeResult | TwoFactorErrorResult> {
        const userId = await this.tokens.findUserId(ctx, token, 'recovery');
        if (!userId) return twoFactorError('RECOVERY_LINK_INVALID');
        return this.locks.withUser(ctx, userId, async txCtx => {
            const row = await this.tokens.findUsable(
                txCtx,
                token,
                'recovery',
                this.options.maxTokenAttempts ?? MAX_TOKEN_ATTEMPTS_DEFAULT,
            );
            if (!row) return twoFactorError('RECOVERY_LINK_INVALID');
            const user = await this.users.getUserById(txCtx, userId);
            if (!user || !(await this.challenges.mayUseApi(txCtx, user))) {
                return twoFactorError('RECOVERY_LINK_INVALID');
            }
            if (!(await this.verification.passwordMatches(txCtx, userId, password))) {
                await this.tokens.recordFailure(txCtx, row.id);
                return twoFactorError('PASSWORD_INVALID');
            }
            if (!(await this.tokens.claim(txCtx, row.id))) {
                return twoFactorError('RECOVERY_LINK_INVALID');
            }
            await this.tokens.consumeOpen(txCtx, userId, 'recovery');
            await this.factors.deleteAll(txCtx, userId);
            await this.sessions.deleteSessionsByUser(txCtx, user);
            await this.audit.recordAndNotify(
                txCtx,
                user,
                'recovery-completed',
                new TwoFactorRecoveryCompletedEvent(txCtx, user),
            );
            const issued = await this.challenges.issue(txCtx, userId, 'ENROL');
            return { __typename: 'TwoFactorChallenge', stage: 'ENROL', ...issued };
        });
    }
}
