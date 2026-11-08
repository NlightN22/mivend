import { Inject, Injectable } from '@nestjs/common';
import { AuthService, Logger, RequestContext } from '@vendure/core';
import { SignInThrottleService } from '@mivend/plugin-sign-in-protection';

import { FactorStoreService } from './factor-store.service';
import { decryptSecret } from './secret-cipher';
import { TWO_FACTOR_PLUGIN_OPTIONS, loggerCtx } from './two-factor.types';
import type { FactorRow, TwoFactorPluginOptions } from './two-factor.types';
import { SecondFactorMethodRegistry } from './totp/second-factor-method';

@Injectable()
export class TwoFactorVerificationService {
    constructor(
        private factors: FactorStoreService,
        private authService: AuthService,
        private methods: SecondFactorMethodRegistry,
        private throttle: SignInThrottleService,
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    // The accepted step, or null. Does not consume it: callers claim it atomically.
    // An unreadable secret (wrong key, tampering) is logged and answered as a wrong code, never a 500.
    matchStep(factor: FactorRow, code: string, nowMs = Date.now()): number | null {
        let secret: string;
        try {
            secret = decryptSecret(factor.secretEncrypted, this.options.encryptionKey, factor.uuid);
        } catch {
            Logger.error(
                `Cannot decrypt the second-factor secret of factor ${factor.uuid}`,
                loggerCtx,
            );
            return null;
        }
        return this.methods.get(factor.method).verify(secret, code, nowMs, factor.lastUsedStep);
    }

    // A locked account is answered as a wrong code without looking at the code.
    async verifyAndClaim(ctx: RequestContext, factor: FactorRow, code: string): Promise<boolean> {
        if (await this.throttle.isLocked(ctx, 'second-step', factor.userId)) return false;
        const step = this.matchStep(factor, code);
        if (step !== null && (await this.factors.claimStep(ctx, factor.id, step))) {
            await this.throttle.reset(ctx, 'second-step', factor.userId);
            return true;
        }
        await this.throttle.recordFailure(ctx, 'second-step', factor.userId);
        return false;
    }

    async passwordMatches(ctx: RequestContext, userId: string, password: string): Promise<boolean> {
        if (await this.throttle.isLocked(ctx, 'password-recheck', userId)) return false;
        if ((await this.authService.verifyUserPassword(ctx, userId, password)) === true) {
            await this.throttle.reset(ctx, 'password-recheck', userId);
            return true;
        }
        await this.throttle.recordFailure(ctx, 'password-recheck', userId);
        return false;
    }
}
