import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, SessionService, UserService } from '@vendure/core';

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
    RECOVERY_TTL_DEFAULT_MS,
    TWO_FACTOR_PLUGIN_OPTIONS,
    twoFactorError,
} from './two-factor.types';
import type {
    TwoFactorChallengeResult,
    TwoFactorErrorResult,
    TwoFactorPluginOptions,
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
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    // Silent for unknown addresses and accounts without a factor, so the answer reveals nothing.
    async request(ctx: RequestContext, emailAddress: string): Promise<void> {
        const user = await this.users.getUserByEmailAddress(
            ctx,
            emailAddress,
            ctx.apiType === 'admin' ? 'administrator' : 'customer',
        );
        if (!user) return;
        const userId = String(user.id);
        await this.locks.withUser(ctx, userId, async txCtx => {
            if (!(await this.factors.hasActive(txCtx, userId))) return;
            await this.tokens.supersedeOpen(txCtx, userId, 'recovery');
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
                // #278: throttle failed password attempts here.
                await this.tokens.recordFailure(txCtx, row.id);
                return twoFactorError('PASSWORD_INVALID');
            }
            if (!(await this.tokens.claim(txCtx, row.id))) {
                return twoFactorError('RECOVERY_LINK_INVALID');
            }
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
